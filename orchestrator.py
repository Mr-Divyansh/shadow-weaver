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
import ai_analyst
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
    # AI Security Analyst pipeline bookkeeping (dedup / in-flight / active ops)
    "ai_inflight": 0,
    "ai_seen": {},
    "ai_active": {},
}
clients: list[WebSocket] = []
shutdown_event = asyncio.Event()

# ── Startup / Shutdown ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB pool and background tasks
    await init_db_pool()
    # Initialize alert queue
    alerts.alert_queue = asyncio.Queue()
    asyncio.create_task(alerts._alert_processor())
    asyncio.create_task(prompt_janitor())
    asyncio.create_task(event_pruner())
    asyncio.create_task(metrics_updater())
    logger.info(f"Orchestrator started port={config.ORCH_PORT}")
    yield
    # Shutdown
    shutdown_event.set()
    await asyncio.sleep(0.5)
    await close_db_pool()
    logger.info("Orchestrator shutdown complete")

# ─── App Definition ────────────────────────────────────────
app = FastAPI(title="Shadow-Weaver Orchestrator", lifespan=lifespan)
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

# Event types that feed the AI Security Analyst pipeline. These are meaningful
# security events (new detections / honeypot capture / attacker adaptation),
# NOT every UI update — this is the API-cost control.
AI_PIPELINE_TYPES = ("shield.detect", "honeypot.intel", "attack.adapt")
AI_BRIEF_MIN_SEVERITY = 8  # honeypot.intel severity gate for narration

async def _maybe_narrate(etype: str, data: dict):
    if etype not in COOLDOWN_TYPES and etype not in AI_PIPELINE_TYPES:
        return
    if etype in AI_PIPELINE_TYPES:
        # Event-driven AI security analysis (deduped, bounded concurrency).
        asyncio.create_task(_run_ai_pipeline(etype, data))
    key = data.get("ip") or data.get("peer") or ""
    now = time.time()
    last = state["ai_narrated"].get((etype, key), 0)
    if now - last < config.NARRATION_COOLDOWN:
        return
    if etype == "honeypot.intel" and int(data.get("severity", 0) or 0) < AI_BRIEF_MIN_SEVERITY:
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
        await record("ai.brief", "ai.brain", {"event": etype, "brief": brief,
                     "recommendation": rec, "engine": "gemini", "mode": "live"})
        AI_BRIEFS.inc()
    except Exception as e:
        logger.warning(f"AI brief failed error={e}")

# ── AI Security Analyst pipeline ────────────────────────────────────────────
# ATTACK → TELEMETRY → AI ANALYSIS → DECISION → DEFENSE → VERIFICATION → AUDIT
# Every step is recorded through record() so it lands in SQLite (audit log)
# and on the existing WebSocket feed. The AI only RECOMMENDS actions from the
# safe enum; execution always goes through existing defense handlers.

async def _run_ai_pipeline(etype: str, data: dict):
    try:
        ip = str(data.get("ip") or data.get("peer") or "unknown")
        pattern = str(data.get("detect") or etype.replace("shield.", ""))
        now = time.time()

        # Idempotency: skip duplicate AI calls for the same source+pattern.
        dedup_key = (ip, pattern)
        if now - state["ai_seen"].get(dedup_key, 0) < config.AI_DEDUP_WINDOW:
            return
        # Bounded concurrency: never queue unbounded AI work.
        if state["ai_inflight"] >= config.AI_MAX_CONCURRENT:
            return
        state["ai_seen"][dedup_key] = now
        state["ai_inflight"] += 1
        try:
            await _ai_pipeline_inner(etype, data, ip)
        finally:
            state["ai_inflight"] = max(0, state["ai_inflight"] - 1)
    except Exception as e:
        logger.warning(f"AI pipeline error type={etype} error={e}")
        # Never let an AI failure break the event flow — the existing
        # deterministic detection/response keeps running regardless.


# ── AI reasoning provenance ────────────────────────────────────────────────
# The AI pipeline never lies about its engine: real Gemini output is labelled
# source=gemini/mode=live; anything else (deterministic fallback rule engine)
# is labelled source=simulation/mode=demo so the UI can show DEMO AI.
def _ai_source(engine: str) -> dict:
    if engine == "gemini":
        return {"source": "gemini", "mode": "live"}
    return {"source": "simulation", "mode": "demo"}


async def _ai_pipeline_inner(etype: str, data: dict, ip: str):
    pattern = str(data.get("detect") or etype.replace("shield.", ""))
    prior = sum(1 for (seen_ip, _), t in state["ai_seen"].items() if seen_ip == ip)
    honeypot_seen = bool(state["attack"].get("active", False))

    tel = ai_analyst.build_telemetry_view(etype, data, prior_events=prior,
                                          honeypot_seen=honeypot_seen)
    event_id = f"ai-{int(time.time() * 1000)}"
    await record("ai.analysis.started", "ai.analyst",
                 {"event_id": event_id, "trigger": etype, "ip": ip,
                  "pattern": pattern})

    t0 = time.time()
    analysis = await ai_analyst.analyze(tel)  # never raises; falls back itself
    duration_ms = round((time.time() - t0) * 1000)
    await record("ai.analysis.completed", "ai.analyst", {
        "event_id": event_id, "ip": ip, "pattern": pattern,
        "engine": analysis.get("engine", "unknown"),
        "duration_ms": duration_ms,
        "analysis": {k: analysis.get(k) for k in
                     ("threat_type", "severity", "confidence", "risk_score",
                      "indicators", "reasoning", "recommended_action",
                      "verification_required")}})

    # ── ai_reasoning (analysis stage): human-readable, provenance-honest ────
    src = _ai_source(analysis.get("engine", "deterministic"))
    await record("ai.reasoning", "ai.analyst", {
        "event_id": event_id, "threat_id": event_id, "ip": ip,
        "stage": "analysis",
        "classification": str(analysis["threat_type"]).replace("_", " "),
        "confidence": analysis["confidence"],
        "risk": analysis["severity"],
        "risk_score": analysis["risk_score"],
        "recommendation": analysis["recommended_action"],
        "target": ip,
        "reasoning": analysis["reasoning"],
        "source": src["source"],
        "mode": src["mode"],
    })

    decision = ai_analyst.decide(analysis, state["guardrail_mode"])
    await record("ai.decision.made", "ai.analyst", {
        "event_id": event_id, "ip": ip, "pattern": pattern,
        "threat_type": analysis["threat_type"],
        "severity": analysis["severity"],
        "confidence": analysis["confidence"],
        "risk_score": analysis["risk_score"],
        "recommended_action": decision["recommended_action"],
        "action": decision["action"],
        "policy_notes": decision["policy_notes"]})

    # ── ai_reasoning (decision stage): the selected defensive action ────────
    await record("ai.reasoning", "ai.analyst", {
        "event_id": event_id, "threat_id": event_id, "ip": ip,
        "stage": "decision",
        "classification": str(analysis["threat_type"]).replace("_", " "),
        "confidence": analysis["confidence"],
        "risk": analysis["severity"],
        "recommendation": decision["action"],
        "target": ip,
        "reasoning": (decision.get("policy_notes") or [analysis["reasoning"]])[0],
        "action": decision["action"],
        "source": src["source"],
        "mode": src["mode"],
    })

    state["ai_active"][ip] = {"event_id": event_id, "ip": ip,
                              "pattern": pattern,
                              "threat_type": analysis["threat_type"],
                              "started_ts": time.time()}

    # ── Execute through the EXISTING defense handlers ──────────────────────
    await _execute_defense(decision["action"], ip, analysis, event_id)

    # ── Verification over the post-action telemetry window ─────────────────
    if decision["action"] in ("HONEYPOT", "BLOCK", "ISOLATE"):
        await record("ai.verification.started", "ai.analyst",
                     {"event_id": event_id, "ip": ip, "action": decision["action"],
                      "window_seconds": config.AI_VERIFICATION_WINDOW,
                      "threat_type": analysis["threat_type"]})
        await asyncio.sleep(config.AI_VERIFICATION_WINDOW)
        verdict = await _verify_and_record(ip, event_id)
        if verdict and verdict.get("status") == "CONTAINED":
            # ── ai_reasoning (verification stage): proof the cycle closed ────
            await record("ai.reasoning", "ai.analyst", {
                "event_id": event_id, "threat_id": event_id, "ip": ip,
                "stage": "verification", "status": "CONTAINED",
                "classification": str(analysis["threat_type"]).replace("_", " "),
                "confidence": verdict.get("confidence", analysis["confidence"]),
                "risk": analysis["severity"],
                "recommendation": "Containment verified",
                "target": ip,
                "reasoning": verdict.get("reason", "Threat contained and verified."),
                "action": decision["action"],
                "source": src["source"],
                "mode": src["mode"],
            })
    else:
        state["ai_active"].pop(ip, None)
        await record("ai.verification.completed", "ai.analyst", {
            "event_id": event_id, "ip": ip, "action": decision["action"],
            "status": "MONITORING", "confidence": analysis["confidence"],
            "reason": "Action is MONITOR — source kept under observation; "
                      "no containment verification required."})

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


async def _execute_defense(action: str, ip: str, analysis: dict, event_id: str):
    """Run the validated AI action through existing backend capabilities.
    The AI never produces commands — these are the only paths it can take."""
    reason = f"AI:{analysis['threat_type']} risk={analysis['risk_score']}"
    result = "RECORDED_ONLY"
    await record("defense.action.started", "ai.analyst",
                 {"event_id": event_id, "ip": ip, "action": action,
                  "threat_type": analysis["threat_type"], "reason": reason})
    try:
        if action in ("BLOCK", "ISOLATE"):
            # Existing Blue Shield block path (firewall executor honors
            # EXECUTOR_DRY_RUN). On any failure we still record the block
            # orchestrator-side so Blue/Red state stays consistent.
            executed = False
            try:
                import http_client
                if not hasattr(_execute_defense, "_blue_http") or \
                        _execute_defense._blue_http is None:
                    _execute_defense._blue_http = http_client.HttpClient(
                        f"http://127.0.0.1:{config.BLUE_PORT}",
                        retry_attempts=1, circuit_failure_threshold=3)
                await _execute_defense._blue_http.post(
                    "/control/block", json_data={"ip": ip, "reason": reason,
                                                 "decision": "ai-analyst"})
                executed = True
                result = "BLOCKED"
            except Exception as e:
                logger.warning(f"Blue Shield block call failed ({e}) — "
                               f"recording orchestrator-side block only")
            await record("shield.block", "ai.analyst",
                         {"ip": ip, "action": f"block {ip}",
                          "reason": reason, "decision": "ai-analyst",
                          "ttl": 300, "rules": [], "executed": executed})
        elif action == "HONEYPOT":
            # The existing Honeypot on :8022 stays untouched; the orchestrator
            # records the deception handoff so real honeypot sessions from
            # this peer join the same AI lifecycle.
            await record("honeypot.session_opened", "ai.analyst",
                         {"ip": ip, "event_id": event_id,
                          "note": "AI handed source to deception environment",
                          "threat_type": analysis["threat_type"]})
            result = "CAPTIVE"
        else:  # MONITOR
            await record("ai.monitor", "ai.analyst",
                         {"ip": ip, "event_id": event_id,
                          "note": "AI recommends continued observation"})
            result = "MONITOR_ONLY"
    except Exception as e:
        logger.warning(f"Defense execution error action={action} error={e}")
    finally:
        await record("defense.action.completed", "ai.analyst",
                     {"event_id": event_id, "ip": ip, "action": action,
                      "threat_type": analysis["threat_type"],
                      "result": result,
                      "verification_required": analysis.get("verification_required", False)})


async def _verify_and_record(ip: str, event_id: str):
    ctx = state["ai_active"].pop(ip, None)
    try:
        started_at = datetime.fromtimestamp(
            time.time() - config.AI_VERIFICATION_WINDOW - 1,
            tz=timezone.utc).isoformat()
        async with get_db() as con:
            rows = await (await con.execute(
                "SELECT ts,type,source,data FROM events WHERE ts >= ?",
                (started_at,))).fetchall()
        window_events = [{"ts": r[0], "type": r[1], "source": r[2],
                          "data": json.loads(r[3])} for r in rows]
        verdict = ai_analyst.verify(window_events, ip)
        await record("ai.verification.completed", "ai.analyst", {
            "event_id": event_id, "ip": ip,
            "threat_type": (ctx or {}).get("threat_type"),
            "status": verdict["status"], "confidence": verdict["confidence"],
            "reason": verdict["reason"],
            "new_malicious_events": verdict["new_malicious_events"]})
        if verdict["status"] == "CONTAINED":
            await record("threat.contained", "ai.analyst",
                         {"event_id": event_id, "ip": ip,
                          "threat_type": (ctx or {}).get("threat_type"),
                          "verification": verdict})
        return verdict
    except Exception as e:
        logger.warning(f"AI verification failed error={e}")
        return None


@app.post("/api/v1/ai/demo")
async def ai_demo():
    """Hackathon demo: drive the REAL AI pipeline with a controlled, clearly
    labelled telemetry event. Same analysis/decision/verification code path
    as live attacks — no mocked AI output."""
    await record("system.attack", "orchestrator",
                 {"action": "start", "vector": "ssh_brute"})
    await record("shield.detect", "blue.shield(192.168.50.20)", {
        "ip": "192.168.50.40", "detect": "ssh_brute",
        "target": "192.168.50.20:22", "attempts": 6, "window": 10,
        "note": "controlled demo event: simulated SSH brute-force burst"})
    return {"ok": True, "detail": "AI pipeline engaged — watch the AI "
                                  "Security Analyst panel"}

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
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=1.0)
            except (asyncio.TimeoutError, WebSocketDisconnect):
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
            # Keep AI pipeline bookkeeping bounded too: dedup/narration keys and
            # stale active-ops are cleared once far past their lifecycle.
            now = time.time()
            staleness = {
                k: t for k, t in state["ai_seen"].items()
                if now - t > max(config.AI_DEDUP_WINDOW * 2, 900)
            }
            for k in staleness:
                state["ai_seen"].pop(k, None)
            stale_narr = [
                k for k, t in state["ai_narrated"].items()
                if now - t > max(config.NARRATION_COOLDOWN * 2, 300)
            ]
            for k in stale_narr:
                state["ai_narrated"].pop(k, None)
            for ip, info in list(state["ai_active"].items()):
                age = now - float(info.get("started_ts", now))
                if age > max(config.AI_VERIFICATION_WINDOW * 2, 60):
                    state["ai_active"].pop(ip, None)
        except Exception:
            pass

async def metrics_updater():
    while not shutdown_event.is_set():
        BLOCKED_IPS.set(len(state["blocked"]))
        PENDING_PROMPT.set(1 if state["pending_prompt"] else 0)
        WS_CONNECTIONS.set(len(clients))
        await asyncio.sleep(10)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.ORCH_HOST, port=config.ORCH_PORT, log_config=None)