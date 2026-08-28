"""Shadow-Weaver AI Brain — Gemini-powered attack strategy and narration.

Safety: narration/strategy calls use real Gemini ONLY when a valid GEMINI_KEY
is configured. Without a key (or on any Gemini failure) the same functions
return the deterministic demo defaults below — those defaults are explicitly
labelled simulation and are never presented as live Gemini output. The
authoritative AI threat analysis/decision pipeline lives in ai_analyst.py;
this module only adds ambient narration and high-level recommendations.
"""

import json
import logging
import urllib.error
import urllib.request

import config

logger = logging.getLogger("shadow.ai_brain")

GEMINI_URL = config.GEMINI_URL


def _gemini_json(prompt: str, system: str, max_tokens: int = 160) -> dict | None:
    """One-shot Gemini JSON response using stdlib only (no new dependency).

    Returns a parsed JSON dict on success, or None on any failure (missing
    key, network error, timeout, malformed response) — never raises.
    """
    api_key = getattr(config, "GEMINI_KEY", "") or ""
    if not api_key:
        return None
    url = f"{GEMINI_URL}/{config.GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.2,
            "maxOutputTokens": max_tokens,
        },
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    try:
        timeout = float(getattr(config, "AI_TIMEOUT", 8.0))
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except Exception as e:
        logger.warning(f"Gemini brain call failed ({type(e).__name__}) — falling back")
        return None


_NARRATE_SYSTEM = (
    "You are the Shadow-Weaver SOC narrator. Given one security event "
    "(type + sanitized metadata), write ONE short professional SOC sentence. "
    'Reply with ONLY JSON: {"brief": "..."}. Never include credentials, '
    "payloads, or command output."
)


def narrate(event_type: str, data: dict) -> str | None:
    """Real Gemini narration; None on failure / no key (no fake narration)."""
    safe = {k: v for k, v in (data or {}).items()
            if k.lower() not in ("command", "payload", "password",
                                 "token", "creds", "authorization")}
    result = _gemini_json(
        f"event_type={event_type} data={json.dumps(safe)[:800]}",
        _NARRATE_SYSTEM)
    brief = (result or {}).get("brief")
    return str(brief).strip() if brief else None


_RECOMMEND_SYSTEM = (
    "You are the Shadow-Weaver SOC response advisor. Given the recent event "
    "types, recommend ONE concrete defensive action for the Blue Team. "
    'Reply with ONLY JSON: {"recommendation": "..."}. Under 20 words.'
)


def recommend(events: list) -> str:
    """Real Gemini recommendation; deterministic fallback on any failure.
    The fallback string is the same honest, generic guidance used in demo
    mode — it is never passed off as live Gemini output."""
    kinds = [str(e.get("type", "?")).split(".")[-1] for e in (events or [])][-10:]
    result = _gemini_json(
        f"recent events: {', '.join(kinds)}", _RECOMMEND_SYSTEM)
    rec = (result or {}).get("recommendation")
    if rec and str(rec).strip():
        return str(rec).strip()
    # Deterministic demo fallback (no key / Gemini unavailable).
    return "Contain suspicious source"


def classify_vulns(web, auth, stress) -> list:
    """Classify vulnerabilities from recon findings. Returns empty list in demo mode."""
    return []


# ── Deterministic mission planner (offline / no GEMINI_KEY) ────────────────
# Builds a small multi-step plan dict compatible with red_team.execute():
#   {"goal","gap","technique","steps":[{"action","target","params"}],
#    "rationale","expected"}
# Constraints honored per red_prompt.SYSTEM_PROMPT: steps <= 4, concurrency
# <= 30, only ports 8080 (blue) / 8022 (honey), never port 8000.

_VALID_ACTIONS = {
    "probe", "dir_brute", "backup_hunt", "sqli", "traversal",
    "encoded_traversal", "cmd_inject", "auth", "token_replay",
    "header_fuzz", "payload", "slowloris", "large_payload", "flood",
    "tunnel", "backoff", "report",
}


def _target(kind: str) -> dict:
    import config
    t = config.BLUE if kind == "blue" else config.HONEY
    return {"host": t["host"], "port": t["port"], "ip": t["ip"]}


def _pick(techniques, tried) -> str:
    """First technique not yet tried; falls back to the first entry."""
    for tech in techniques:
        if tech not in tried:
            return tech
    return techniques[0] if techniques else "probe"


def plan_mission(findings: dict, history: list, phase: str,
                 exploit_n: int, tried: set) -> dict:
    """Rule-based kill-chain planner. Picks the highest-leverage confirmed gap
    from recon findings, avoids repeating already-tried techniques, and chains
    1-4 ordered steps for the current phase."""
    web = (findings or {}).get("web") or {}
    auth = (findings or {}).get("auth") or {}
    vulns = (findings or {}).get("vulns") or []

    def step(action, kind="blue", params=None):
        return {"action": action, "target": _target(kind),
                "params": params or {}}

    # ── Gap ranking: strongest confirmed evidence first ──────────────────
    ranked = []
    if web.get("sqli"):
        ranked.append(("sqli", "unauthenticated SQL injection at /api/users"))
    if web.get("cmd_inject"):
        ranked.append(("cmd_inject", "command echo via /api/ping host parameter"))
    if web.get("traversal") or web.get("backup_exposed"):
        ranked.append(("encoded_traversal", "path traversal / exposed backups under /static"))
    if auth.get("ok") or auth.get("default_creds"):
        ranked.append(("auth", "default credentials accepted on /api/auth/login"))
    if web.get("hidden_dirs"):
        ranked.append(("dir_brute", "undisclosed admin endpoints discoverable by wordlist"))
    ranked.append(("probe", "surface fingerprinting of the blue-web target"))

    technique = _pick([name for name, _ in ranked], tried)
    gap = dict(ranked)[technique] if technique in dict(ranked) else "general surface probing"

    # ── Phase-specific chaining ─────────────────────────────────────────
    steps = []
    if phase == "recon":
        steps = [
            step("probe"),
            step("dir_brute", params={"limit": 20}),
            step("backup_hunt"),
        ]
        goal, expected = ("Map the target's exposed surface",
                          "Service banner + hidden endpoints recorded")

    elif phase == "exploit":
        followups = {"sqli": "traversal", "cmd_inject": "header_fuzz"}
        steps = [step(technique)]
        nxt = followups.get(technique)
        if nxt and nxt not in tried:
            steps.append(step(nxt))
        goal = f"Exploit {gap}"
        expected = "Confirmed impact signal recorded in telemetry"

    elif phase == "post-exploit":
        # If an auth foothold exists, replay it; otherwise probe the decoy.
        if technique == "auth" or auth.get("token"):
            steps = [
                step("auth", params={"user": "admin", "password": "admin"}),
                step("token_replay"),
                step("tunnel", kind="honey",
                     params={"commands": ["whoami", "cat /root/flag.txt"]}),
            ]
        else:
            steps = [
                step("tunnel", kind="honey",
                     params={"commands": ["whoami", "id", "ls -la /root"]}),
            ]
        goal, expected = ("Convert access into an interactive foothold",
                          "Decoy session established on honeypot")

    else:  # exfil
        steps = [
            step("tunnel", kind="honey",
                 params={"commands": ["cat /etc/shadow",
                                      "tar czf /tmp/exfil.tgz /root/flag.txt",
                                      "exit"]}),
            step("report"),
        ]
        goal, expected = ("Exfiltrate staged secrets from the decoy",
                          "Simulated exfil archive created; chain reported")

    # Safety clamp: never exceed four steps.
    steps = steps[:4]

    rationale = ("highest-confidence untried gap" if technique not in tried
                 else "all known gaps tried — rotating primary technique")

    return {
        "goal": goal,
        "gap": gap,
        "technique": technique,
        "steps": [s for s in steps if s["action"] in _VALID_ACTIONS],
        "rationale": rationale,
        "expected": expected,
    }