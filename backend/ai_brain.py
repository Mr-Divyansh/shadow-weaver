"""Shadow-Weaver AI Brain — Gemini-powered attack strategy and narration.

Safety: All functions are stubs for demo mode. No real AI calls are made
without a valid GEMINI_KEY in the environment.
"""


def narrate(event_type: str, data: dict) -> str | None:
    """Generate AI narration for an event. Returns None in demo mode."""
    return None


def recommend(events: list) -> str:
    """Generate an AI recommendation based on recent events."""
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