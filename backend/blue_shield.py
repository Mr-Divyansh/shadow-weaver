"""
Production-grade Blue Shield: aiohttp server + production HTTP client + structured logging.
"""
import asyncio
import json
import logging
import signal
import sys
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import config
from aiohttp import web
from http_client import HttpClient, CircuitBreakerOpen
import executor

# ── Logging ─────────────────────────────────────────────────────────
STANDARD_KEYS = {"name", "msg", "args", "created", "relativeCreated",
                 "exc_info", "exc_text", "stack_info", "lineno", "funcName",
                 "levelname", "levelno", "pathname", "filename", "module",
                 "thread", "threadName", "process", "processName", "taskName",
                 "message", "msecs"}

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "ts": __import__("datetime").datetime.fromtimestamp(
                record.created, tz=__import__("datetime").timezone.utc).isoformat(),
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
    return logging.getLogger("shadow.blue")

logger = setup_logging()

# ── Constants ───────────────────────────────────────────────────────
IDENTITY = "blue.shield"
SELF_IP = config.BLUE_IP
ORCH = config.ORCH
LOG_PATH = config.LOG_DIR / "sw_blue.log"
FLOOD_THRESHOLD = config.FLOOD_THRESHOLD
FLOOD_WINDOW = config.FLOOD_WINDOW
BRUTE_THRESHOLD = config.BRUTE_THRESHOLD
BRUTE_WINDOW = config.BRUTE_WINDOW
AUTH_SPRAY_THRESHOLD = config.AUTH_SPRAY_THRESHOLD
BLOCK_TTL = config.BLOCK_TTL
THROTTLE_TTL = config.THROTTLE_TTL
CORR_WINDOW = config.CORR_WINDOW
CORR_MIN_DISTINCT = config.CORR_MIN_DISTINCT
SERVER_VERSION = "Shadow-Web/1.2.1"
DEFAULT_CREDS = {"admin": "admin", "root": "shadow", "operator": "letmein"}
START_TIME = time.time()

# State
hits = defaultdict(list)
brute = defaultdict(list)
auth_attempts = defaultdict(list)
blocked = {}
prompted = {}
sessions = {}
throttled = {}
baseline = defaultdict(float)
recent_detects = defaultdict(list)
rules = []
playbook_count = 0
detect_count = 0
corr_count = 0
guardrail_mode = "autonomous"

# HTTP client
http_client: HttpClient = None

# Detection enrichment
DETECT_META = {
    "sqli":          {"cwe": "CWE-89",  "attck": "T1190", "sev": 9},
    "cmd_inject":    {"cwe": "CWE-78",  "attck": "T1059", "sev": 9},
    "path_traversal": {"cwe": "CWE-22", "attck": "T1083", "sev": 8},
    "ssh_bruteforce": {"cwe": "CWE-307", "attck": "T1110", "sev": 8},
    "auth_spray":    {"cwe": "CWE-307", "attck": "T1110.003", "sev": 8},
    "http_flood":    {"cwe": "CWE-770", "attck": "T1498", "sev": 7},
    "header_fuzz":   {"cwe": "CWE-693", "attck": "T1190", "sev": 5},
}

PLAYBOOKS = {
    "sqli": [{"action": "add_waf_rule", "rule": "reject request.uri contains ( ' ) OR ( -- )"},
             {"action": "log", "rule": "sql injection watch enabled"}],
    "cmd_inject": [{"action": "add_filter", "rule": "reject query.host matches [;|&`$(]"},
                   {"action": "disable_shell_endpoint", "rule": "revoke /api/ping command surface"}],
    "path_traversal": [{"action": "add_filter", "rule": "reject request.uri contains ( .. )"},
                       {"action": "enable_encoded_decode", "rule": "double-decode URI before policy"}],
    "ssh_bruteforce": [{"action": "lockout", "rule": "5 failures / 5s per source"},
                       {"action": "disable_weak_ciphers", "rule": "drop legacy kex"}],
    "auth_spray": [{"action": "lockout", "rule": "5 failures / 5s per source"},
                   {"action": "enable_mfa_prompt", "rule": "challenge on re-login"}],
    "http_flood": [{"action": "rate_limit", "rule": "5 req / 2s per source"},
                   {"action": "enable_syn_cookies", "rule": "tarpit under load"}],
    "header_fuzz": [{"action": "sanitize_headers", "rule": "strip X-Fuzz/X-Test"},
                    {"action": "enable_waf_paranoia", "rule": "strict header policy"}],
}


def log(msg):
    try:
        with LOG_PATH.open("a") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


async def post_telemetry(etype, data):
    if http_client is None:
        return
    try:
        await http_client.post("/api/v1/telemetry",
                               json_data={"type": etype, "source": IDENTITY, "data": data})
    except CircuitBreakerOpen:
        logger.warning(f"CB open dropping telemetry type={etype}")
    except Exception as e:
        logger.warning(f"telemetry failed type={etype} error={e}")


async def get_orch_status():
    global guardrail_mode
    if http_client is None:
        return {}
    try:
        st = await http_client.get("/api/v1/status")
        guardrail_mode = st.get("guardrail_mode", "autonomous")
        return st
    except Exception:
        return {}


async def post_json_to_orch(path, payload):
    if http_client is None:
        return None
    try:
        return await http_client.post(path, json_data=payload)
    except Exception:
        return None


def blocked_resp(ip):
    return web.json_response({"error": "contained by Shadow-Weaver shield"}, status=403)


@web.middleware
async def security_headers(request, handler):
    resp = await handler(request)
    resp.headers["Server"] = SERVER_VERSION
    return resp


async def run_playbook(ip, dtype):
    global playbook_count
    actions = PLAYBOOKS.get(dtype, [])
    if not actions:
        return
    playbook_count += 1
    applied = []
    for a in actions:
        rule = {"attack": dtype, "action": a["action"],
                "rule": a.get("rule", ""), "ts": round(time.time(), 1)}
        if rule not in rules:
            rules.append(rule)
        # Real execution: apply the playbook action at system level
        await executor.apply_playbook(a["action"], a.get("rule", ""), ip=ip)
        applied.append(a["action"])
    await post_telemetry("shield.playbook", {"ip": ip, "attack_type": dtype,
                              "playbook": [a["action"] for a in actions],
                              "applied": applied})
    log(f"PLAYBOOK {ip} {dtype} -> {', '.join(applied)}")


async def raise_detect(ip, dtype, extra, contain=False):
    """Enriched detection -> playbook -> correlation -> response ladder."""
    global detect_count
    meta = DETECT_META.get(dtype, {"cwe": "CWE-000", "attck": "T0000", "sev": 5})
    sev = meta["sev"]
    ev = {"ip": ip, "type": dtype, **extra,
          "cwe": meta["cwe"], "attack_technique": meta["attck"],
          "severity": sev,
          "confidence": 0.9 if sev >= 9 else (0.8 if sev >= 8 else 0.7 if sev >= 6 else 0.6)}
    detect_count += 1
    await post_telemetry("shield.detect", ev)
    log(f"DETECT {ip} {dtype} sev={sev} cwe={meta['cwe']} attck={meta['attck']}")

    now = time.time()
    recent_detects[ip].append((now, dtype))
    recent_detects[ip] = [(t, d) for t, d in recent_detects[ip] if now - t < CORR_WINDOW]
    await run_playbook(ip, dtype)

    distinct = {d for _, d in recent_detects[ip]}
    if len(distinct) >= CORR_MIN_DISTINCT and ip not in blocked and ip not in prompted:
        global corr_count
        corr_count += 1
        chain = sorted(distinct)
        await post_telemetry("shield.correlation",
             {"ip": ip, "chain": chain, "distinct": len(chain),
              "window": CORR_WINDOW, "escalation": "multi-vector"})
        log(f"CORRELATE {ip} chain={'+'.join(chain)} -> escalate")
        await handle_containment(ip, f"multi-vector attack - {' + '.join(chain)}")
        return "escalated"

    if contain:
        await post_telemetry("shield.defense", {"ip": ip, "action": "contain", "severity": sev,
                                "reason": f"{dtype} sev {sev}/10"})
        return "contain"

    repeats = len(recent_detects[ip])
    if sev >= 8 or repeats >= 3:
        await post_telemetry("shield.defense", {"ip": ip, "action": "block", "severity": sev,
                                "repeats": repeats,
                                "reason": f"{dtype} sev {sev}/10 repeat x{repeats}"})
        if ip not in blocked and ip not in prompted:
            await handle_containment(ip, f"{dtype} - severity {sev}/10, repeat x{repeats}")
        return "block"
    throttled[ip] = now + THROTTLE_TTL
    await post_telemetry("shield.defense", {"ip": ip, "action": "throttle", "severity": sev,
                            "until": throttled[ip],
                            "reason": f"{dtype} sev {sev}/10"})
    log(f"THROTTLE {ip} {dtype} for {THROTTLE_TTL}s")
    return "throttle"


@web.middleware
async def traversal_detector(request, handler):
    ip = request.headers.get("X-Agent-IP", request.remote)
    raw = request.raw_path
    decoded = urllib.parse.unquote(raw)
    if ".." in raw or ".." in decoded:
        if ip in blocked:
            return blocked_resp(ip)
        await raise_detect(ip, "path_traversal", {"path": raw})
        return web.json_response({
            "file": "/etc/shadow",
            "content": "root:$6$p4Y0sH1ft$H9kZ2qWv0xLmNpR4tU7yA1cE3gI5jK8s:19000:0:99999:7:::",
            "note": "traversal succeeded - sensitive file exposed"})
    return await handler(request)


async def target(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    for k, v in request.headers.items():
        if k.lower() in ("x-test", "x-fuzz", "x-forwarded-for", "user-agent") \
                and any(c in v for c in ('"', "'", "<", ">", "`")):
            if ip not in blocked:
                await raise_detect(ip, "header_fuzz", {"header": k, "value": v[:60]})
                return web.json_response({"error": "bad request"}, status=400)
    hits[ip].append(time.time())
    if ip in blocked:
        return blocked_resp(ip)
    if ip in throttled and throttled[ip] > time.time():
        return web.json_response({"error": "rate limited by Shadow-Weaver shield"}, status=429)
    return web.Response(text="Shadow-Weaver target app - you are being watched", status=200)


async def admin(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    token = request.cookies.get("sw_session", "")
    if token not in sessions:
        return web.json_response({"auth": "required", "hint": "/api/auth/login"}, status=401)
    return web.json_response({"status": "ok", "role": "admin",
                              "uptime": round(time.time() - START_TIME, 1)})


async def api_health(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"status": "ok", "version": SERVER_VERSION,
                              "hostname": "blue-node-02",
                              "uptime": round(time.time() - START_TIME, 1)})


async def api_users(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    q = request.query.get("id", "")
    if "'" in q or "--" in q or " or " in q.lower():
        await raise_detect(ip, "sqli", {"payload": q, "endpoint": "/api/users"})
        return web.json_response({"error": f'SQLite syntax error near "{q}"'}, status=500)
    return web.json_response({"id": q or 1, "name": "admin", "role": "admin",
                              "hash": "$2y$10$w7xQqLmNpRtUvWxYzAbCdEeFgHiJkLmNoPqRsTu"})


async def api_config(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"db_host": "db.shadow.local", "db_user": "root",
                              "db_pass": config.DEMO_DB_PASSWORD, "version": SERVER_VERSION,
                              "api_key": config.DEMO_API_KEY})


async def api_ping(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    host = request.query.get("host", "127.0.0.1")
    if any(c in host for c in (";", "|", "&", "`", "$(")):
        await raise_detect(ip, "cmd_inject", {"payload": host, "endpoint": "/api/ping"})
        return web.json_response({
            "cmd": host,
            "output": f"PING {host} (192.168.50.10): 56 data bytes\n"
                      "uid=0(root) gid=0(root) groups=0(root)\n"
                      "root:x:0:0:root:/root:/bin/bash",
            "note": "command executed on host"})
    return web.json_response({"host": host, "output": "ping: no response", "note": "normal"})


async def backup_config_bak(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"file": "config.bak",
        "db": {"host": "db.shadow.local", "user": "root", "password": config.DEMO_DB_PASSWORD},
        "api_key": config.DEMO_API_KEY, "admin_token": config.DEMO_ADMIN_TOKEN})


async def git_config(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"[core]": "repositoryformatversion = 0",
        "[remote \"origin\"]": "url = http://git.shadow.local/shadow/app.git",
        "[credential]": "helper = store",
        "credentials": "http://ci-bot:GitP@ss!2026@git.shadow.local"})


async def app_old(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"file": "app.old",
        "snippet": "def connect():\n    return psycopg2.connect("
                   "host='db.shadow.local', user='app', password='AppP@ss2026')",
        "note": "stale deployment artifact"})


async def debug_view(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    return web.json_response({"debug": True, "stack": "aiohttp.web", "version": SERVER_VERSION,
        "env": {"APP_ENV": "production", "DB_PASS": config.DEMO_DB_PASSWORD, "FLAG_STAGE": "staging"},
        "note": "debug mode enabled in production"})


async def internal_view(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    if ip in blocked:
        return blocked_resp(ip)
    token = request.cookies.get("sw_session", "")
    if token not in sessions:
        return web.json_response({"auth": "required", "hint": "internal only"}, status=401)
    return web.json_response({"internal": "ok", "net": "192.168.50.0/24",
                              "nodes": ["core .10", "blue .20", "honey .30"]})


async def shield_status(request):
    now = time.time()
    executor_status = executor.get_firewall_status()
    return web.json_response({
        "agent": "blue.shield", "mode": guardrail_mode, "version": SERVER_VERSION,
        "uptime": round(now - START_TIME, 1),
        "detections": detect_count, "playbooks": playbook_count,
        "correlations": corr_count, "rules_active": len(rules),
        "blocked": {ip: {"reason": info["reason"], "decision": info["decision"],
                         "ttl_left": round(max(0, info["ttl"] - (now - info["ts"])), 1)}
                    for ip, info in blocked.items()},
        "throttled": {ip: round(until - now, 1) for ip, until in throttled.items() if until > now},
        "rules": rules[-10:],
        "adaptive_threshold": {ip: max(FLOOD_THRESHOLD, int(b * 2)) for ip, b in baseline.items()},
        "sessions": len(sessions),
        "executor": executor_status})


async def auth_login(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    data = await request.json()
    user = data.get("user", "")
    pwd = data.get("password", "")
    auth_attempts[ip].append(time.time())
    if DEFAULT_CREDS.get(user) == pwd:
        token = f"tok-{int(time.time())}-{len(sessions)}"
        sessions[token] = ip
        return web.json_response({"token": token},
            headers={"Set-Cookie": f"sw_session={token}; Path=/; HttpOnly"})
    return web.json_response({"auth": "failed"}, status=401)


async def ssh_login(request):
    ip = request.headers.get("X-Agent-IP", request.remote)
    data = await request.json()
    brute[ip].append(time.time())
    return web.json_response({"auth": "failed"}, status=401)


def _valid_ip(ip: str) -> bool:
    parts = str(ip).split(".")
    return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


async def control_block(request):
    """Controlled block endpoint used by the orchestrator's AI decision layer.
    Accepts ONLY a validated IP plus fixed reason/decision fields — the AI can
    never pass arbitrary commands through here. Execution goes through the
    existing execute_block() path (state + firewall executor)."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    ip = str(data.get("ip", ""))
    if not _valid_ip(ip):
        return web.json_response({"error": "invalid ip"}, status=400)
    reason = str(data.get("reason", "AI decision"))[:120]
    execute_block(ip, reason, decision="ai-analyst")
    await post_telemetry("shield.block", {"ip": ip, "action": "ufw deny from " + ip,
                          "reason": reason, "decision": "ai-analyst",
                          "ttl": BLOCK_TTL, "rules": list(blocked)})
    return web.json_response({"ok": True, "ip": ip, "blocked": True})


def execute_block(ip, reason, decision="autonomous"):
    blocked[ip] = {"reason": reason, "ts": time.time(), "decision": decision, "ttl": BLOCK_TTL}
    baseline[ip] = 0.0
    throttled.pop(ip, None)
    log(f"BLOCK {ip} reason={reason} decision={decision} ttl={BLOCK_TTL}s")
    # Real execution: block IP at firewall level
    executor.block_ip(ip, reason=reason)


async def post_block(ip, reason, decision="autonomous"):
    execute_block(ip, reason, decision)
    await post_telemetry("shield.block", {"ip": ip, "action": "ufw deny from " + ip,
                          "reason": reason, "decision": decision,
                          "ttl": BLOCK_TTL, "rules": list(blocked)})


async def wait_for_decision(event_id, ip, reason):
    deadline = time.time() + 45
    decided = False
    while time.time() < deadline:
        st = await get_orch_status()
        pp = st.get("pending_prompt")
        if pp and pp.get("event_id") == event_id and "decision" in pp:
            decision = pp["decision"]
            if decision == "approve":
                await post_block(ip, reason, decision="manual-approved")
                await post_telemetry("shield.containment", {"ip": ip, "reason": reason,
                                             "mode": "manual", "decision": "approve"})
                await post_json_to_orch("/api/v1/containment/ack",
                           {"event_id": event_id, "executed": True})
            else:
                await post_telemetry("shield.containment", {"ip": ip, "reason": reason,
                                             "mode": "manual", "decision": "ignore"})
                await post_json_to_orch("/api/v1/containment/ack",
                           {"event_id": event_id, "executed": False})
            decided = True
            break
        await asyncio.sleep(1)
    prompted.pop(ip, None)
    if not decided:
        await post_telemetry("shield.containment", {"ip": ip, "reason": reason,
                                    "mode": "manual", "decision": "timeout"})


async def handle_containment(ip, reason):
    global guardrail_mode
    await get_orch_status()
    if guardrail_mode == "autonomous":
        await post_block(ip, reason)
        await post_telemetry("shield.containment", {"ip": ip, "reason": reason, "mode": "autonomous"})
    else:
        if ip in prompted:
            return
        event_id = f"cnt-{int(time.time())}"
        prompted[ip] = event_id
        await post_telemetry("containment.prompt", {
            "event_id": event_id, "ip": ip, "reason": reason,
            "question": "Approve containment?", "mode": "manual"})
        log(f"PROMPT {ip} {event_id} reason={reason}")
        asyncio.create_task(wait_for_decision(event_id, ip, reason))


async def shield_loop():
    while True:
        await asyncio.sleep(2)
        st = await get_orch_status()
        orch_blocked = set((st.get("blocked") or {}).keys())
        now = time.time()

        # AI decision adoption: orchestrator-issued AI blocks (decision=
        # "ai-analyst") are enforced locally through the same execute_block
        # path as native detections (state + real firewall executor).
        for aip, ainfo in (st.get("blocked") or {}).items():
            if isinstance(ainfo, dict) and ainfo.get("decision") == "ai-analyst" \
                    and aip not in blocked:
                execute_block(aip, ainfo.get("reason", "AI decision"),
                              decision="ai-analyst")

        for ip in list(blocked):
            if ip not in orch_blocked:
                del blocked[ip]
                prompted.pop(ip, None)

        for ip, info in list(blocked.items()):
            if now - info["ts"] > info.get("ttl", BLOCK_TTL):
                del blocked[ip]
                prompted.pop(ip, None)
                baseline[ip] = 0.0
                log(f"UNBLOCK {ip} ttl expired ({info['reason']})")
                await post_telemetry("shield.block_expired", {"ip": ip, "reason": info["reason"]})
                await post_json_to_orch("/api/v1/control/unblock", {"ip": ip})
                # Real execution: remove firewall block
                executor.unblock_ip(ip)

        for ip in list(throttled):
            if throttled[ip] < now:
                del throttled[ip]
                log(f"THROTTLE-END {ip}")

        for ip, stamps in list(hits.items()):
            recent = [t for t in stamps if now - t < FLOOD_WINDOW]
            hits[ip] = recent
            rate10 = len([t for t in stamps if now - t < 10])
            baseline[ip] = baseline.get(ip, 0) * 0.85 + rate10 * 0.15
            thr = max(FLOOD_THRESHOLD, int(baseline[ip] * 2))
            if ip not in blocked and ip not in prompted and len(recent) >= thr:
                await raise_detect(ip, "http_flood",
                             {"requests": len(recent), "window": FLOOD_WINDOW,
                              "threshold": thr}, contain=True)
                await handle_containment(ip,
                    f"HTTP flood - {len(recent)} req/{FLOOD_WINDOW}s (adaptive thr {thr})")

        for ip, stamps in list(brute.items()):
            recent = [t for t in stamps if now - t < BRUTE_WINDOW]
            brute[ip] = recent
            if ip not in blocked and ip not in prompted and len(recent) >= BRUTE_THRESHOLD:
                await raise_detect(ip, "ssh_bruteforce",
                             {"attempts": len(recent), "window": BRUTE_WINDOW}, contain=True)
                await handle_containment(ip,
                    f"SSH brute force - {len(recent)} attempts/{BRUTE_WINDOW}s")

        for ip, stamps in list(auth_attempts.items()):
            recent = [t for t in stamps if now - t < BRUTE_WINDOW]
            auth_attempts[ip] = recent
            if ip not in blocked and ip not in prompted and len(recent) >= AUTH_SPRAY_THRESHOLD:
                await raise_detect(ip, "auth_spray",
                             {"attempts": len(recent), "window": BRUTE_WINDOW}, contain=True)
                await handle_containment(ip,
                    f"Auth spray - {len(recent)} attempts/{BRUTE_WINDOW}s")


async def main():
    global http_client
    http_client = HttpClient(
        ORCH,
        max_connections=config.HTTP_MAX_CONNECTIONS,
        max_keepalive=config.HTTP_MAX_KEEPALIVE,
        timeout_total=config.HTTP_TIMEOUT_TOTAL,
        timeout_connect=config.HTTP_TIMEOUT_CONNECT,
        retry_attempts=config.HTTP_RETRY_ATTEMPTS,
        retry_backoff=config.HTTP_RETRY_BACKOFF,
        circuit_failure_threshold=config.CIRCUIT_FAILURE_THRESHOLD,
        circuit_recovery_timeout=config.CIRCUIT_RECOVERY_TIMEOUT,
    )
    await http_client.__aenter__()

    shutdown_event = asyncio.Event()

    app = web.Application()
    app.middlewares.append(security_headers)
    app.middlewares.append(traversal_detector)
    app.router.add_get("/", target)
    app.router.add_get("/admin", admin)
    app.router.add_get("/api/health", api_health)
    app.router.add_get("/api/users", api_users)
    app.router.add_get("/api/config", api_config)
    app.router.add_get("/api/ping", api_ping)
    app.router.add_get("/backup/config.bak", backup_config_bak)
    app.router.add_get("/.git/config", git_config)
    app.router.add_get("/app.old", app_old)
    app.router.add_get("/debug", debug_view)
    app.router.add_get("/internal", internal_view)
    app.router.add_get("/api/v1/shield", shield_status)
    app.router.add_post("/api/auth/login", auth_login)
    app.router.add_post("/api/ssh/login", ssh_login)
    # Controlled AI decision execution (validated IP only, fixed fields)
    app.router.add_post("/control/block", control_block)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", config.BLUE_PORT)
    await site.start()
    print(f"Blue-Team target on http://localhost:{config.BLUE_PORT}  (shield armed)")
    await post_telemetry("system.heartbeat", {"agent": "blue.shield", "ip": SELF_IP, "status": "armed"})

    try:
        await shield_loop()
    finally:
        await runner.cleanup()
        await http_client.close()
        logger.info("Blue Shield shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())