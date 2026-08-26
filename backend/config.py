import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Project root: this module may live at the project root OR inside backend/.
# Resolve to the folder that contains the project (the one holding src/, assets/,
# package.json) no matter which copy of config.py is imported.
PROJECT_ROOT = ROOT.parent if ROOT.name.lower() == "backend" else ROOT
DATA_DIR = PROJECT_ROOT / "data"
LOG_DIR = PROJECT_ROOT / "logs"
# Create them eagerly so SQLite (events.db) and file loggers never crash on a
# missing directory at first run.
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

ORCH = "http://127.0.0.1:8000"
ORCH_HOST = "0.0.0.0"
ORCH_PORT = 8000
BLUE_PORT = 8080
HONEY_PORT = 8022

CORE_IP = "192.168.50.10"
BLUE_IP = "192.168.50.20"
HONEY_IP = "192.168.50.30"
RED_IP = "192.168.50.40"

FLOOD_THRESHOLD = 15
BRUTE_THRESHOLD = 8
FLOOD_WINDOW = 2
BRUTE_WINDOW = 5

def _load_env():
    envf = ROOT / ".env"
    if not envf.exists():
        envf = ROOT.parent / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env()

GEMINI_KEY = os.environ.get("GEMINI_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"

EVENT_RETENTION = 5000
PROMPT_TIMEOUT = 90
NARRATION_COOLDOWN = 20

# Shadow-Strike red-team engine (safety + autonomy)
MAX_CONCURRENCY = 30
STRESS_DURATION = 4
STRESS_CONCURRENCY = 25
RECON_STRESS_CONCURRENCY = 8
RECON_STRESS_DURATION = 1
BACKOFF_BASE = 0.5
BACKOFF_MAX = 10.0
BACKOFF_THRESHOLD = 0.3      # error rate that triggers backoff
PHASES = ["recon", "exploit", "post-exploit", "exfil"]
AUTH_SPRAY_THRESHOLD = 5
DECOY_MAX_COMMANDS = 12
SLOWLORIS_SOCKETS = 12
SLOWLORIS_DURATION = 3
DIR_BRUTE_LIMIT = 40
LARGE_PAYLOAD_SIZE = 200000

# Blue Shield adaptive defense engine
BLOCK_TTL = 180            # temp block auto-expires (s)
THROTTLE_TTL = 30          # rate-limit hold per low-severity detect (s)
CORR_WINDOW = 60           # multi-signal correlation window (s)
CORR_MIN_DISTINCT = 3      # distinct attack types needed to escalate

# Honeypot decoy engine
HONEY_AUTH_ATTEMPTS = 3
HONEY_IDLE_TIMEOUT = 30

# Production HTTP client settings
HTTP_MAX_CONNECTIONS = 100
HTTP_MAX_KEEPALIVE = 20
HTTP_TIMEOUT_TOTAL = 10.0
HTTP_TIMEOUT_CONNECT = 3.0
HTTP_RETRY_ATTEMPTS = 3
HTTP_RETRY_BACKOFF = 0.5
CIRCUIT_FAILURE_THRESHOLD = 5
CIRCUIT_RECOVERY_TIMEOUT = 30.0

# DB pool
DB_POOL_SIZE = 10

BLUE_HOST = "127.0.0.1"
HONEY_HOST = "127.0.0.1"
BLUE = {"ip": BLUE_IP, "host": BLUE_HOST, "port": BLUE_PORT}
HONEY = {"ip": HONEY_IP, "host": HONEY_HOST, "port": HONEY_PORT}

# Executor: real system execution layer
EXECUTOR_DRY_RUN = os.environ.get("EXECUTOR_DRY_RUN", "true").lower() == "true"
FIREWALL_TOOL = os.environ.get("FIREWALL_TOOL", "auto")  # auto | iptables | ufw | netsh
SSH_CONFIG_PATH = os.environ.get("SSH_CONFIG_PATH", "/etc/ssh/sshd_config")

# SSH Monitor
SSH_BRUTE_THRESHOLD = 5
SSH_BRUTE_WINDOW = 10
SSH_SPRAY_THRESHOLD = 4
SSH_SPRAY_WINDOW = 30

# Alerts (set in .env)
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")
GENERIC_WEBHOOKS = os.environ.get("GENERIC_WEBHOOKS", "")

# Demo credentials (loaded from .env, override with your own values if needed)
DEMO_API_KEY = os.environ.get("DEMO_API_KEY", "sk-live-9f8e7d6c5b4a3")
DEMO_DB_PASSWORD = os.environ.get("DEMO_DB_PASSWORD", "S3cret!")
DEMO_ADMIN_TOKEN = os.environ.get("DEMO_ADMIN_TOKEN", "tok-2026-backup-root")
ALERT_COOLDOWN = 60