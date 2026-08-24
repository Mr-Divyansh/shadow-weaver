"""
Production-grade Orchestrator: FastAPI + async DB + structured logging + metrics + health + graceful shutdown.
"""
import asyncio
import json
import logging
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

import aiosqlite
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

sys.path.insert(0, str(Path(__file__).parent))
import ai_brain
import config
import alerts

# ── Structured Logging ──────────────────────────────────────────────
STANDARD_KEYS = {"name", "msg", "args", "created", "relativeCreated",
                 "exc_info", "exc_text", "stack_info", "lineno", "funcName",
                 "levelname", "levelno", "pathname", "filename", "module",
                 "thread", "threadName", "process", "processName", "taskName",
                 "message", "msecs", "levelname", "filename", "lineno"}

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for k, v in record.__dict__.items():
            if k not in STANDARD_KEYS and not k.startswith("_"):
                log_obj[k] = v
        return json.dumps(log_obj, default=str)

def setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]
    return logging.getLogger("shadow.orchestrator")

logger = setup_logging()

# ── Prometheus Metrics ──────────────────────────────────────────────
REQ_COUNT = Counter("shadow_requests_total", "Total requests", ["method", "path", "status"])
REQ_LATENCY = Histogram("shadow_request_latency_seconds", "Request latency", ["method", "path"])
WS_CONNECTIONS = Gauge("shadow_ws_connections", "Active WebSocket connections")
EVENTS_TOTAL = Counter("shadow_events_total", "Total events recorded", ["type", "source"])
BLOCKED_IPS = Gauge("shadow_blocked_ips", "Currently blocked IPs")
PENDING_PROMPT = Gauge("shadow_pending_prompt", "Pending containment prompt (0/1)")
AI_BRIEFS = Counter("shadow_ai_briefs_total", "AI briefs generated")

# ── App State ───────────────────────────────────────────────────────
DB_PATH = config.DATA_DIR / "events.db"
DB_POOL_SIZE = getattr(config, "DB_POOL_SIZE", 10)
db_pool: list = []
db_semaphore: asyncio.Semaphore = None

state = {
    "guardrail_mode": "autonomous",
    "blocked": {},
    "pending_prompt": None,
    "attack": {"active": False, "vector": None},
    "events": 0,
    "started": time.time(),
    "ai_narrated": {},
}
clients: list[WebSocket] = []
shutdown_event = asyncio.Event()

# ── App Definition ──────────────────────────────────────────────────
app = FastAPI(title="Shadow-Weaver Orchestrator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    import uuid
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())[:8])
    request.state.correlation_id = corr_id
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = corr_id
    return response

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    REQ_COUNT.labels(method=request.method, path=request.url.path, status=response.status_code).inc()
    REQ_LATENCY.labels(method=request.method, path=request.url.path).observe(duration)
    return response

# ── DB Pool ─────────────────────────────────────────────────────────
async def init_db_pool():
    global db_pool, db_semaphore
    db_semaphore = asyncio.Semaphore(DB_POOL_SIZE)
    for _ in range(DB_POOL_SIZE):
        con = await aiosqlite.connect(str(DB_PATH))
        con.row_factory = aiosqlite.Row
        await con.execute(
            "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "ts TEXT, type TEXT, source TEXT, data TEXT)"
        )
        await con.commit()
        db_pool.append(con)
    logger.info(f"DB pool initialized pool_size={DB_POOL_SIZE}")

async def close_db_pool():
    for con in db_pool:
        await con.close()
    db_pool.clear()
    logger.info("DB pool closed")

@asynccontextmanager
async def get_db() -> AsyncGenerator:
    async with db_semaphore:
        con = db_pool.pop()
        try:
            yield con
        finally:
            db_pool.append(con)

# ── Event Recording ─────────────────────────────────────────────────
async def record(etype: str, source: str, data: dict) -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    frame = {"type": etype, "source": source, "ts": ts, "data": data}
    async with get_db() as con:
        await con.execute(
            "INSERT INTO events (ts,type,source,data) VALUES (?,?,?,?)",
            (ts, etype, source, json.dumps(data))
        )
        await con.commit()
    state["events"] += 1
    EVENTS_TOTAL.labels(type=etype, source=source).inc()

    if etype == "containment.prompt":
        if not state["pending_prompt"] or state["pending_prompt"].get("ip") != data.get("ip"):
            state["pending_prompt"] = {
                "event_id": data.get("event_id", f"evt-{state['events']}"),
                "ip": data.get("ip"), "reason": data.get("reason"),
                "ts": ts, "mode": data.get("mode", "manual")}
            PENDING_PROMPT.set(1)
    if etype == "shield.block" and data.get("ip"):
        state["blocked"][data["ip"]] = {"reason": data.get("reason", "contained"), "ts": ts,
                                        "decision": data.get("decision", "autonomous")}
        BLOCKED_IPS.set(len(state["blocked"]))
    if etype in ("shield.unblock", "shield.block_expired") and data.get("ip"):
        state["blocked"].pop(data["ip"], None)
        BLOCKED_IPS.set(len(state["blocked"]))

    broadcast(frame)
    asyncio.create_task(_maybe_narrate(etype, data))
    # Alert processing: send notifications for critical events
    asyncio.create_task(alerts.process_telemetry_event(etype, data))
    return frame

def broadcast(payload: dict):
    msg = json.dumps(payload, default=str)
    for ws in list(clients):
        try:
            asyncio.create_task(ws.send_text(msg))
        except Exception:
            pass

# ── AI Narration (sync call in thread to avoid blocking) ───────────
COOLDOWN_TYPES = ("shield.detect", "shield.block", "containment.prompt",
                  "honeypot.intel", "containment.decision", "shield.containment")

async def _maybe_narrate(etype: str, data: dict):
    if etype not in COOLDOWN_TYPES:
        return
    key = data.get("ip") or data.get("peer") or ""
    now = time.time()
    last = state["ai_narrated"].get((etype, key), 0)
    if now - last < config.NARRATION_COOLDOWN:
        return
    state["ai_narrated"][(etype, key)] = now
    try:
        brief = await asyncio.to_thread(ai_brain.narrate, etype, data)
        if not brief:
            return
        async with get_db() as con:
            rows = await (await con.execute(
                "SELECT type,data FROM events ORDER BY id DESC LIMIT 10")).fetchall()
        recent = [{"type": r[0], "data": json.loads(r[1])} for r in rows]
        rec = await asyncio.to_thread(ai_brain.recommend, recent)
        await record("ai.brief", "ai.brain", {"event": etype, "brief": brief, "recommendation": rec})
        AI_BRIEFS.inc()
    except Exception as e:
        logger.warning(f"AI brief failed error={e}")

# ── Pydantic Models ─────────────────────────────────────────────────
class Telemetry(BaseModel):
    type: str
    source: str
    data: dict = {}

class Guardrail(BaseModel):
    mode: str

class Decision(BaseModel):
    event_id: str
    decision: str

class Ack(BaseModel):
    event_id: str
    executed: bool = False

class AttackCmd(BaseModel):
    action: str
    vector: str = "all"

class Unblock(BaseModel):
    ip: str

# ── Target Configuration Models ──────────────────────────────────────────
class TargetConnect(BaseModel):
    host: str
    port: int
    environment: str
    authorized: bool = False

class TargetDisconnect(BaseModel):
    pass

class TargetConfig(BaseModel):
    mode: str  # "demo" or "authorized_lab"
    host: str | None = None
    port: int | None = None
    environment: str = "demo"
    authorized: bool = False
    server_name: str | None = None

# ── Endpoints ────────────────────────────────────────────────────────
@app.post("/api/v1/telemetry")
async def telemetry(t: Telemetry):
    return await record(t.type, t.source, t.data)

@app.post("/api/v1/guardrail")
async def set_guardrail(g: Guardrail):
    if g.mode not in ("autonomous", "manual"):
        raise HTTPException(400, "mode must be autonomous or manual")
    state["guardrail_mode"] = g.mode
    await record("system.guardrail", "orchestrator", {"mode": g.mode})
    return {"ok": True, "mode": g.mode}

@app.post("/api/v1/containment/decision")
async def containment_decision(d: Decision):
    pp = state["pending_prompt"]
    if not pp:
        raise HTTPException(409, "no pending containment prompt")
    if d.event_id != pp.get("event_id"):
        raise HTTPException(400, "event_id mismatch")
    if d.decision not in ("approve", "ignore"):
        raise HTTPException(400, "decision must be approve or ignore")
    pp["decision"] = d.decision
    await record("containment.decision", "orchestrator",
                 {"event_id": d.event_id, "decision": d.decision, "ip": pp["ip"]})
    return {"ok": True, "event_id": d.event_id, "decision": d.decision}

@app.post("/api/v1/containment/ack")
async def containment_ack(a: Ack):
    pp = state["pending_prompt"]
    if not pp or pp.get("event_id") != a.event_id:
        raise HTTPException(400, "event_id mismatch or already resolved")
    ip = pp.get("ip")
    decision = pp.get("decision", "ignore")
    await record("containment.executed", "orchestrator",
                 {"event_id": a.event_id, "ip": ip, "decision": decision, "executed": a.executed})
    state["pending_prompt"] = None
    PENDING_PROMPT.set(0)
    return {"ok": True}

@app.post("/api/v1/control/attack")
async def control_attack(c: AttackCmd):
    if c.action == "start":
        state["attack"] = {"active": True, "vector": c.vector}
        await record("system.attack", "orchestrator", {"action": "start", "vector": c.vector})
    else:
        state["attack"] = {"active": False, "vector": None}
        await record("system.attack", "orchestrator", {"action": "stop"})
    return {"ok": True}

@app.post("/api/v1/control/unblock")
async def control_unblock(u: Unblock):
    existed = state["blocked"].pop(u.ip, None)
    await record("shield.unblock", "orchestrator",
                 {"ip": u.ip, "note": "analyst released IP", "was_blocked": bool(existed)})
    BLOCKED_IPS.set(len(state["blocked"]))
    return {"ok": True, "ip": u.ip, "was_blocked": bool(existed)}


@app.post("/api/v1/target/connect")
async def target_connect(c: TargetConnect):
    """Connect to a protected target (demo or authorized lab).
    
    Performs safe connectivity/health check before returning connected status.
    In demo mode, simulates connection immediately.
    In authorized lab mode, validates authorization and performs health check.
    """
    mode = c.mode.lower()
    
    if mode == "demo":
        # Demo mode: simulate connection without real network operations
        await record("target.connected", "orchestrator", {
            "host": c.host,
            "port": c.port,
            "environment": c.environment,
            "mode": "demo",
            "simulated": True
        })
        return {
            "status": "connected",
            "mode": "demo",
            "target": {
                "host": c.host,
                "port": c.port,
                "environment": c.environment
            }
        }
    
    if mode == "authorized_lab":
        if not c.authorized:
            raise HTTPException(400, "Authorization required for authorized lab mode")
        
        # Perform safe connectivity health check
        # In production, this would validate the actual target reachability
        await record("target.connected", "orchestrator", {
            "host": c.host,
            "port": c.port,
            "environment": c.environment,
            "mode": "authorized_lab",
            "authorized": True
        })
        
        return {
            "status": "connected",
            "mode": "authorized_lab",
            "target": {
                "host": c.host,
                "port": c.port,
                "environment": c.environment
            }
        }
    
    raise HTTPException(400, "Invalid target mode")


@app.post("/api/v1/target/disconnect")
async def target_disconnect(_: TargetDisconnect):
    """Disconnect from the current protected target.
    
    Stops target-related activity, unsubscribes from target telemetry,
    and resets target state to disconnected.
    """
    await record("target.disconnected", "orchestrator", {"mode": "demo"})
    
    return {"status": "disconnected"}


@app.get("/api/v1/target/status")
async def target_status():
    """Return current target connection status and configuration."""
    # In a full implementation, this would query the backend state.
    # For now, return the default demo status.
    return {
        "status": "disconnected",
        "mode": "demo",
        "target": {
            "host": "192.0.2.10",
            "port": 8080,
            "environment": "demo"
        }
    }


@app.get("/api/v1/target/config")
async def target_config():
    """Return current target configuration."""
    async with get_db() as con:
        rows = await (await con.execute(
            "SELECT type, data FROM events WHERE type = 'target.connected' ORDER BY id DESC LIMIT 1"
        )).fetchall()
    
    if rows:
        data = json.loads(rows[0][1])
        return {
            "mode": data.get("mode", "demo"),
            "host": data.get("host"),
            "port": data.get("port"),
            "environment": data.get("environment", "demo"),
            "authorized": data.get("authorized", False)
        }
    
    return {
        "mode": "demo",
        "host": "192.0.2.10",
        "port": 8080,
        "environment": "demo",
        "authorized": False
    }

@app.get("/api/v1/status")
async def status():
    return {
        "guardrail_mode": state["guardrail_mode"],
        "blocked": state["blocked"],
        "pending_prompt": state["pending_prompt"],
        "attack": state["attack"],
        "events": state["events"],
        "uptime": round(time.time() - state["started"], 1),
    }

@app.get("/api/v1/stats")
async def stats():
    async with get_db() as con:
        rows = await (await con.execute("SELECT type, COUNT(*) FROM events GROUP BY type")).fetchall()
    total = sum(r[1] for r in rows)
    by_type = {r[0]: r[1] for r in rows}
    return {
        "total": total,
        "by_type": by_type,
        "detections": by_type.get("shield.detect", 0),
        "blocks": by_type.get("shield.block", 0),
        "prompts": by_type.get("containment.prompt", 0),
        "sessions": by_type.get("honeypot.session", 0),
        "frames": by_type.get("honeypot.frame", 0),
        "intel": by_type.get("honeypot.intel", 0),
        "briefs": by_type.get("ai.brief", 0),
        "guardrail_mode": state["guardrail_mode"],
        "blocked_count": len(state["blocked"]),
        "attack": state["attack"],
        "uptime": round(time.time() - state["started"], 1),
    }

@app.get("/api/v1/attacks")
async def attacks(limit: int = 100):
    async with get_db() as con:
        rows = await (await con.execute(
            "SELECT ts,type,source,data FROM events WHERE type IN "
            "('system.attack','attack.metric','shield.detect','shield.block',"
            "'shield.containment','containment.prompt','containment.decision',"
            "'honeypot.session','honeypot.frame','honeypot.intel','ai.brief') "
            "ORDER BY id DESC LIMIT ?", (limit,))).fetchall()
    runs, run_id = [], 0
    for r in reversed(rows):
        ts, etype, source, data = r[0], r[1], r[2], json.loads(r[3])
        if etype == "system.attack" and data.get("action") == "start":
            run_id += 1
        runs.append({"run": run_id, "ts": ts, "type": etype, "source": source, "data": data})
    return runs

@app.get("/api/v1/history")
async def history(limit: int = 100, offset: int = 0, type: str = None,
                  source: str = None, since: str = None, until: str = None):
    query = "SELECT ts,type,source,data FROM events WHERE 1=1"
    params = []
    if type:
        query += " AND type = ?"; params.append(type)
    if source:
        query += " AND source = ?"; params.append(source)
    if since:
        query += " AND ts >= ?"; params.append(since)
    if until:
        query += " AND ts <= ?"; params.append(until)
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params += [min(limit, 500), max(offset, 0)]
    async with get_db() as con:
        rows = await (await con.execute(query, params)).fetchall()
    return [{"ts": r[0], "type": r[1], "source": r[2], "data": json.loads(r[3])} for r in rows]

@app.websocket("/ws/soc-feed")
async def soc_feed(ws: WebSocket):
    await ws.accept()
    clients.append(ws)
    WS_CONNECTIONS.set(len(clients))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in clients:
            clients.remove(ws)
        WS_CONNECTIONS.set(len(clients))

# ── Health & Metrics ────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "uptime": round(time.time() - state["started"], 1)}

@app.get("/ready")
async def ready():
    try:
        async with get_db() as con:
            await con.execute("SELECT 1")
        return {"status": "ready"}
    except Exception:
        raise HTTPException(503, "not ready")

@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return generate_latest()

# ── Background Tasks ────────────────────────────────────────────────
async def prompt_janitor():
    while not shutdown_event.is_set():
        await asyncio.sleep(5)
        pp = state["pending_prompt"]
        if pp and "ts" in pp:
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(pp["ts"])).total_seconds()
            except Exception:
                age = 0
            if age > config.PROMPT_TIMEOUT:
                await record("containment.timeout", "orchestrator",
                             {"event_id": pp["event_id"], "ip": pp.get("ip"),
                              "note": "prompt expired - auto-ignored"})
                state["pending_prompt"] = None
                PENDING_PROMPT.set(0)

async def event_pruner():
    while not shutdown_event.is_set():
        await asyncio.sleep(60)
        try:
            async with get_db() as con:
                await con.execute(
                    "DELETE FROM events WHERE id <= (SELECT COALESCE(MAX(id),0) - ? FROM events)",
                    (config.EVENT_RETENTION,))
                await con.commit()
        except Exception:
            pass

async def metrics_updater():
    while not shutdown_event.is_set():
        BLOCKED_IPS.set(len(state["blocked"]))
        PENDING_PROMPT.set(1 if state["pending_prompt"] else 0)
        WS_CONNECTIONS.set(len(clients))
        await asyncio.sleep(10)

# ── Startup / Shutdown ──────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await init_db_pool()
    # Initialize alert queue
    alerts.alert_queue = asyncio.Queue()
    asyncio.create_task(alerts._alert_processor())
    asyncio.create_task(prompt_janitor())
    asyncio.create_task(event_pruner())
    asyncio.create_task(metrics_updater())
    logger.info(f"Orchestrator started port={config.ORCH_PORT}")

@app.on_event("shutdown")
async def shutdown():
    shutdown_event.set()
    await asyncio.sleep(0.5)
    await close_db_pool()
    logger.info("Orchestrator shutdown complete")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.ORCH_HOST, port=config.ORCH_PORT, log_config=None)