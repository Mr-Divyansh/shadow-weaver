"""Shadow-Weaver AI Security Analyst — explainable, event-driven AI decisions.

Receives structured security telemetry and returns a STRICT validated JSON
analysis (threat type, severity, confidence, risk, indicators, reasoning,
recommended action). Uses the existing Gemini infrastructure (config.GEMINI_KEY
/ config.GEMINI_MODEL) when available; otherwise falls back to a deterministic
rule engine that produces the SAME output schema so the rest of the system
never has to care which engine ran.

Safety contract:
  * The LLM never executes anything. It can only RECOMMEND one of the fixed
    actions in ALLOWED_ACTIONS; the orchestrator validates and enforces policy
    before any existing defense handler runs.
  * Raw LLM output is never trusted: validate_analysis() enforces the schema,
    clamps ranges and whitelists enums. Anything invalid -> deterministic
    fallback for the same telemetry.
  * Telemetry is sanitized before it leaves the process: payload bodies,
    credentials, tokens and captured honeypot commands are never sent.
"""

import json
import logging
import time
from typing import Any

import config

logger = logging.getLogger("shadow.ai_analyst")

# ── Safety enums (the ONLY actions the decision layer may ever produce) ─────
ALLOWED_ACTIONS = ("MONITOR", "HONEYPOT", "BLOCK", "ISOLATE")
ALLOWED_SEVERITIES = ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL")
ALLOWED_VERIFICATION = ("CONTAINED", "STILL_ACTIVE", "UNCERTAIN")

# Known threat vocabulary. The LLM may return one of these; unknown strings
# fall back to GENERIC_INTRUSION so downstream classification stays stable.
KNOWN_THREATS = {
    "SSH_BRUTE_FORCE", "AUTH_SPRAY", "HTTP_FLOOD", "SQL_INJECTION",
    "COMMAND_INJECTION", "PATH_TRAVERSAL", "HEADER_FUZZING", "PORT_SCAN",
    "SLOWLORIS", "CREDENTIAL_STUFFING", "LATERAL_MOVEMENT",
    "DATA_EXFILTRATION", "GENERIC_INTRUSION",
}

GEMINI_URL = config.GEMINI_URL

SYSTEM_INSTRUCTION = (
    "You are the Shadow-Weaver AI Security Analyst for a SOC dashboard. "
    "You receive structured security telemetry about one suspected attacker "
    "and must respond with ONLY a JSON object, no prose, matching this "
    "schema exactly: "
    '{"threat_type": one of [' + ", ".join(sorted(KNOWN_THREATS)) + "], "
    '"severity": one of [' + ", ".join(ALLOWED_SEVERITIES) + "], "
    '"confidence": number 0..1, "risk_score": integer 0..100, '
    '"indicators": array of short strings (max 5), '
    '"reasoning": one or two sentences of clear SOC-style reasoning, '
    '"recommended_action": one of [' + ", ".join(ALLOWED_ACTIONS) + "], "
    '"verification_required": boolean}. '
    "Rules: judge from the telemetry only; be conservative; use BLOCK only "
    "for high-confidence, high-impact attacks; prefer HONEYPOT to deceive and "
    "observe attackers when the target can afford it; use MONITOR for low "
    "risk. Never include credentials, command strings, or telemetry payloads "
    "in the output."
)

# ── Telemetry view (sanitized) ──────────────────────────────────────────────
def build_telemetry_view(etype: str, data: dict, prior_events: int = 0,
                         honeypot_seen: bool = False) -> dict:
    """Extract the structured, non-sensitive telemetry the analyst is allowed
    to see. Payloads/credentials/commands are deliberately excluded."""
    d = data or {}
    ip = d.get("ip") or d.get("peer") or d.get("source") or "unknown"
    detect = d.get("detect") or etype.replace("shield.", "").replace(".", "_")
    return {
        "event_type": etype,
        "attack_pattern": d.get("detect", detect),
        "source_ip": str(ip),
        "destination": d.get("target") or "blue_shield(192.168.50.20:8080)",
        "protocol": "ssh" if "ssh" in str(detect).lower() else "http",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "request_count": int(d.get("requests", d.get("attempts", 0)) or 0),
        "failed_auth_count": int(d.get("attempts", d.get("failed", 0)) or 0),
        "window_seconds": int(d.get("window", 0) or 0),
        "prior_events_from_source": int(prior_events),
        "honeypot_interaction": bool(honeypot_seen),
        "details": str(d.get("reason", d.get("note", "")))[:160],
    }


# ── Validation (never trust raw LLM output) ─────────────────────────────────
def validate_analysis(obj: Any) -> dict | None:
    """Validate/coerce a candidate analysis dict. Returns a clean dict or None."""
    if not isinstance(obj, dict):
        return None
    threat = str(obj.get("threat_type", "")).upper().strip()
    if threat not in KNOWN_THREATS:
        return None
    severity = str(obj.get("severity", "")).upper().strip()
    if severity not in ALLOWED_SEVERITIES:
        return None
    try:
        confidence = float(obj.get("confidence", 0))
        risk = int(float(obj.get("risk_score", 0)))
    except (TypeError, ValueError):
        return None
    if not (0.0 <= confidence <= 1.0) or not (0 <= risk <= 100):
        return None
    action = str(obj.get("recommended_action", "")).upper().strip()
    if action not in ALLOWED_ACTIONS:
        return None
    indicators = obj.get("indicators", [])
    if not isinstance(indicators, list):
        return None
    indicators = [str(i)[:120] for i in indicators[:5] if str(i).strip()]
    reasoning = str(obj.get("reasoning", "")).strip()[:400]
    if not reasoning:
        return None
    return {
        "threat_type": threat,
        "severity": severity,
        "confidence": round(confidence, 2),
        "risk_score": risk,
        "indicators": indicators,
        "reasoning": reasoning,
        "recommended_action": action,
        "verification_required": bool(obj.get("verification_required", risk >= 70)),
    }

# ── Deterministic fallback engine (same schema, no network) ─────────────────
def deterministic_analysis(tel: dict) -> dict:
    """Rule-based analysis mirroring the existing detection thresholds in
    blue_shield/ssh_monitor. Produces the exact same schema as the LLM path."""
    pattern = str(tel.get("attack_pattern", "")).lower()
    attempts = int(tel.get("failed_auth_count") or 0)
    requests = int(tel.get("request_count") or 0)
    window = int(tel.get("window_seconds") or 0) or 10
    honeypot_seen = bool(tel.get("honeypot_interaction"))
    prior = int(tel.get("prior_events_from_source") or 0)

    if "brute" in pattern or "ssh" in pattern:
        threat, rate = "SSH_BRUTE_FORCE", attempts / max(window, 1)
        sev, risk = ("CRITICAL", 94) if attempts >= 8 or rate >= 1.5 else ("HIGH", 78)
        indicators = ["Repeated authentication failures",
                      f"{attempts} failed attempts in {window}s window"]
        action = "HONEYPOT" if attempts >= 5 else "MONITOR"
        reasoning = ("Repeated authentication failures from the same source "
                     "within a short time window indicate a likely "
                     "brute-force attack.")
    elif "spray" in pattern:
        threat, sev, risk = "AUTH_SPRAY", "HIGH", 80
        indicators = ["Authentication attempts across multiple accounts",
                      f"{attempts} attempts in {window}s window"]
        action = "BLOCK"
        reasoning = "Password spraying pattern across accounts from a single source."
    elif "flood" in pattern or requests >= 40:
        threat, sev, risk = "HTTP_FLOOD", "HIGH", 75
        indicators = ["High request frequency",
                      f"{requests} requests in {window}s window"]
        action = "BLOCK" if requests >= 60 else "HONEYPOT"
        reasoning = "Sustained high request volume consistent with an HTTP flood."
    elif "sqli" in pattern or "injection" in pattern:
        threat, sev, risk = "SQL_INJECTION", "CRITICAL", 92
        indicators = ["Malformed query payloads",
                      "Database error responses triggered"]
        action = "BLOCK"
        reasoning = "Exploitation attempts against the data layer were observed."
    elif "traversal" in pattern:
        threat, sev, risk = "PATH_TRAVERSAL", "HIGH", 84
        indicators = ["Path traversal payloads",
                      "Attempts to reach files outside webroot"]
        action = "BLOCK"
        reasoning = "Directory traversal attempts indicate probing for sensitive files."
    elif "cmd" in pattern:
        threat, sev, risk = "COMMAND_INJECTION", "CRITICAL", 95
        indicators = ["Shell metacharacters in parameters",
                      "Command echo observed"]
        action = "BLOCK"
        reasoning = "Remote command execution attempts against the target."
    elif "fuzz" in pattern:
        threat, sev, risk = "HEADER_FUZZING", "MEDIUM", 55
        indicators = ["Anomalous HTTP headers"]
        action = "MONITOR"
        reasoning = "Header tampering observed without confirmed exploitation."
    elif "slow" in pattern:
        threat, sev, risk = "SLOWLORIS", "HIGH", 72
        indicators = ["Long-held partial connections"]
        action = "BLOCK"
        reasoning = "Slow-loris style connection holding detected."
    else:
        threat, sev, risk = "GENERIC_INTRUSION", "MEDIUM", 60
        indicators = ["Anomalous activity pattern"]
        action = "MONITOR"
        reasoning = "Suspicious activity does not match a known high-impact pattern."

    # Escalation: repeat offenders and honeypot engagement raise the response.
    if prior >= 2 and action == "MONITOR":
        action = "HONEYPOT"
    if honeypot_seen and action == "MONITOR":
        action = "HONEYPOT"
    if risk >= 90 and sev == "CRITICAL" and attempts >= 10:
        action = "BLOCK"

    return {
        "threat_type": threat,
        "severity": sev,
        "confidence": 0.9 if sev in ("HIGH", "CRITICAL") else 0.72,
        "risk_score": risk,
        "indicators": indicators,
        "reasoning": reasoning,
        "recommended_action": action,
        "verification_required": risk >= 70,
    }


# ── Gemini call (single attempt, strict timeout, JSON mode) ─────────────────
async def _gemini_analyze(tel: dict) -> dict | None:
    """Call Gemini generateContent with a JSON response schema. Returns a
    validated analysis dict or None (any failure -> caller falls back)."""
    import aiohttp  # lazy import so the deterministic path never requires it
    api_key = config.GEMINI_KEY
    if not api_key:
        return None
    url = f"{GEMINI_URL}/{config.GEMINI_MODEL}:generateContent?key={api_key}"
    schema = {
        "type": "OBJECT",
        "properties": {
            "threat_type": {"type": "STRING", "enum": sorted(KNOWN_THREATS)},
            "severity": {"type": "STRING", "enum": list(ALLOWED_SEVERITIES)},
            "confidence": {"type": "NUMBER"},
            "risk_score": {"type": "INTEGER"},
            "indicators": {"type": "ARRAY", "items": {"type": "STRING"}},
            "reasoning": {"type": "STRING"},
            "recommended_action": {"type": "STRING", "enum": list(ALLOWED_ACTIONS)},
            "verification_required": {"type": "BOOLEAN"},
        },
        "required": ["threat_type", "severity", "confidence", "risk_score",
                     "indicators", "reasoning", "recommended_action"],
    }
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user",
                      "parts": [{"text": json.dumps(tel, separators=(",", ":"))}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": schema,
            "temperature": 0.2,
            "maxOutputTokens": 512,
        },
    }
    timeout = aiohttp.ClientTimeout(total=config.AI_TIMEOUT)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json=payload) as resp:
                if resp.status != 200:
                    logger.warning(f"Gemini HTTP {resp.status} — falling back")
                    return None
                body = await resp.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return validate_analysis(json.loads(text))
    except Exception as e:
        logger.warning(f"Gemini analysis failed ({type(e).__name__}) — falling back")
        return None


async def analyze(tel: dict) -> dict:
    """Full analysis path: Gemini when configured, deterministic otherwise.
    ALWAYS returns a valid analysis dict (never raises)."""
    result = None
    if config.GEMINI_KEY and config.AI_ANALYST_ENABLED:
        result = await _gemini_analyze(tel)
    if result is None:
        result = deterministic_analysis(tel)
        result["engine"] = "deterministic"
    else:
        result["engine"] = "gemini"
    return result


# ── Decision engine (policy layer — the LLM only recommends) ────────────────
def decide(analysis: dict, guardrail_mode: str = "autonomous") -> dict:
    """Validate the recommended action against policy. Returns the EXECUTABLE
    action plus an explanation. Never returns anything outside ALLOWED_ACTIONS
    and never returns raw model text."""
    recommended = str(analysis.get("recommended_action", "MONITOR")).upper().strip()
    action = recommended if recommended in ALLOWED_ACTIONS else "MONITOR"
    notes = []

    confidence = float(analysis.get("confidence", 0))
    risk = int(analysis.get("risk_score", 0))

    # Policy: blocking/isolation requires strong evidence.
    if action in ("BLOCK", "ISOLATE"):
        if confidence < config.AI_BLOCK_MIN_CONFIDENCE or risk < config.AI_BLOCK_MIN_RISK:
            notes.append(f"downgraded: confidence {confidence:.2f}/risk {risk} "
                         f"below block policy ({config.AI_BLOCK_MIN_CONFIDENCE:.2f}/"
                         f"{config.AI_BLOCK_MIN_RISK})")
            action = "HONEYPOT" if risk >= 50 else "MONITOR"

    # Manual guardrail mode: no autonomous blocking — recommend only.
    if guardrail_mode == "manual" and action in ("BLOCK", "ISOLATE"):
        notes.append("manual guardrail: destructive action deferred to operator")
        action = "HONEYPOT" if risk >= 50 else "MONITOR"

    return {
        "action": action,
        "recommended_action": recommended,
        "confidence": confidence,
        "risk_score": risk,
        "policy_notes": notes,
        "allowed_actions": list(ALLOWED_ACTIONS),
    }


# ── Verification ────────────────────────────────────────────────────────────
def verify(events_in_window: list, source_ip: str) -> dict:
    """Lightweight verification over telemetry recorded AFTER a defense action.
    `events_in_window` is a list of {type, source, data} dicts from the
    orchestrator's event store for the verification window."""
    malicious = ("shield.detect", "attack.payload", "attack.decision",
                 "attack.adapt")
    deception = ("honeypot.session", "honeypot.session_opened")
    new_malicious = 0
    engaged_by_deception = False
    for ev in events_in_window:
        src = str(ev.get("source", ""))
        data = ev.get("data") or {}
        if src.endswith(source_ip) or str(data.get("ip", "")) == source_ip \
                or str(data.get("peer", "")) == source_ip:
            if ev.get("type") in malicious:
                new_malicious += 1
            elif ev.get("type") in deception:
                # The attacker took the bait: honeypot engagement is the
                # DESIRED outcome of a HONEYPOT decision, not continued
                # malicious activity against protected targets.
                engaged_by_deception = True

    if engaged_by_deception:
        return {"status": "CONTAINED", "confidence": 0.95,
                "new_malicious_events": new_malicious,
                "reason": (f"Attacker from {source_ip} engaged by the honeypot "
                           f"deception environment; protected targets "
                           f"unaffected during the verification window.")}

    if new_malicious == 0:
        return {"status": "CONTAINED", "confidence": 0.97,
                "new_malicious_events": 0,
                "reason": (f"No further malicious activity from {source_ip} "
                           f"during the verification window after the "
                           f"defense action.")}
    if new_malicious <= 2:
        return {"status": "UNCERTAIN", "confidence": 0.6,
                "new_malicious_events": new_malicious,
                "reason": (f"{new_malicious} low-volume suspicious events from "
                           f"{source_ip} after the action — continued "
                           f"observation recommended.")}
    return {"status": "STILL_ACTIVE", "confidence": 0.9,
            "new_malicious_events": new_malicious,
            "reason": (f"{new_malicious} malicious events from {source_ip} "
                       f"after the defense action — the threat remains "
                       f"active.")}
