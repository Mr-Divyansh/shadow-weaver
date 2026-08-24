"""Shadow-Weaver SSH Log Monitor — real-time SSH brute force detection.

Tails /var/log/auth.log (Linux) or Windows Event Log for SSH attacks.
Reports findings to orchestrator for blue shield to act on.
"""
import asyncio
import json
import logging
import os
import platform
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import config
from http_client import HttpClient, CircuitBreakerOpen

logger = logging.getLogger("shadow.ssh_monitor")
IDENTITY = "ssh_monitor"

# ── Detection Thresholds ────────────────────────────────────────────
BRUTE_THRESHOLD = 5           # failed attempts before alert
BRUTE_WINDOW = 10             # seconds to count attempts
SPRAY_THRESHOLD = 4           # distinct users attempted
SPRAY_WINDOW = 30
UNLOCK_THRESHOLD = 10         # unlock attempts before alert

# State
failed_attempts = defaultdict(list)     # ip -> [timestamps]
user_attempts = defaultdict(lambda: defaultdict(list))  # ip -> user -> [timestamps]
unlock_attempts = defaultdict(list)     # ip -> [timestamps]
http_client: HttpClient = None

# ── Patterns ────────────────────────────────────────────────────────
# Linux auth.log patterns
PAT_SSH_FAIL = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+Failed password for (?:invalid user )?(\S+) from (\S+) port \d+'
)
PAT_SSH_FAIL_2 = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+Connection closed by authenticating user (\S+) (\S+) port \d+ \[preauth\]'
)
PAT_SSH_FAIL_3 = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+Disconnected from authenticating user (\S+) (\S+) port \d+ \[preauth\]'
)
PAT_SSH_INVALID = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+Invalid user (\S+) from (\S+) port \d+'
)
PAT_SSH_ACCEPT = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+Accepted (?:password|publickey) for (\S+) from (\S+) port \d+'
)
PAT_SSH_UNLOCK = re.compile(
    r'(\w+\s+\d+\s+[\d:]+)\s+\S+\s+sshd\[\d+\]:\s+User (\S+) from (\S+) not found because there is no user with that name'
)


def parse_auth_log_line(line: str):
    """Parse a single auth.log line and return (event_type, user, ip) or None."""
    m = PAT_SSH_FAIL.search(line)
    if m:
        return ("ssh_fail", m.group(2), m.group(3))

    m = PAT_SSH_FAIL_2.search(line)
    if m:
        return ("ssh_fail", m.group(1), m.group(2))

    m = PAT_SSH_FAIL_3.search(line)
    if m:
        return ("ssh_fail", m.group(1), m.group(2))

    m = PAT_SSH_INVALID.search(line)
    if m:
        return ("ssh_fail_invalid", m.group(2), m.group(3))

    m = PAT_SSH_ACCEPT.search(line)
    if m:
        return ("ssh_accept", m.group(2), m.group(3))

    m = PAT_SSH_UNLOCK.search(line)
    if m:
        return ("ssh_unlock", m.group(2), m.group(1))

    return None


async def post_event(etype: str, data: dict):
    """Report event to orchestrator."""
    if http_client is None:
        return
    try:
        await http_client.post("/api/v1/telemetry",
                               json_data={"type": etype, "source": IDENTITY, "data": data})
    except CircuitBreakerOpen:
        logger.warning(f"CB open dropping event type={etype}")
    except Exception as e:
        logger.warning(f"telemetry failed type={etype} error={e}")


async def check_brute_force(ip: str):
    """Check if IP has exceeded brute force threshold."""
    now = time.time()
    recent = [t for t in failed_attempts[ip] if now - t < BRUTE_WINDOW]
    failed_attempts[ip] = recent

    if len(recent) >= BRUTE_THRESHOLD:
        users_tried = list(user_attempts[ip].keys())
        await post_event("ssh.bruteforce", {
            "ip": ip,
            "attempts": len(recent),
            "window": BRUTE_WINDOW,
            "users_targeted": users_tried,
            "source": "ssh_log_monitor"
        })
        logger.warning(f"SSH BRUTE FORCE detected from {ip}: {len(recent)} attempts/{BRUTE_WINDOW}s users={users_tried}")
        # Reset counter after alert
        failed_attempts[ip] = []
        user_attempts[ip].clear()
        return True
    return False


async def check_auth_spray(ip: str):
    """Check if IP is attempting auth spray (multiple users)."""
    now = time.time()
    users = user_attempts[ip]
    recent_users = {}
    for user, stamps in users.items():
        recent = [t for t in stamps if now - t < SPRAY_WINDOW]
        if recent:
            recent_users[user] = recent

    if len(recent_users) >= SPRAY_THRESHOLD:
        await post_event("ssh.auth_spray", {
            "ip": ip,
            "distinct_users": list(recent_users.keys()),
            "user_count": len(recent_users),
            "window": SPRAY_WINDOW,
            "source": "ssh_log_monitor"
        })
        logger.warning(f"SSH AUTH SPRAY from {ip}: {len(recent_users)} users/{SPRAY_WINDOW}s")
        user_attempts[ip].clear()
        return True
    return False


async def process_line(line: str):
    """Process a single auth.log line."""
    result = parse_auth_log_line(line)
    if result is None:
        return

    event_type, user, ip = result
    now = time.time()

    if event_type in ("ssh_fail", "ssh_fail_invalid"):
        failed_attempts[ip].append(now)
        user_attempts[ip][user].append(now)
        await check_brute_force(ip)
        await check_auth_spray(ip)

    elif event_type == "ssh_accept":
        await post_event("ssh.login_success", {
            "ip": ip, "user": user, "source": "ssh_log_monitor"
        })

    elif event_type == "ssh_unlock":
        unlock_attempts[ip].append(now)
        recent = [t for t in unlock_attempts[ip] if now - t < 60]
        unlock_attempts[ip] = recent
        if len(recent) >= UNLOCK_THRESHOLD:
            await post_event("ssh.unlock_attack", {
                "ip": ip, "attempts": len(recent), "source": "ssh_log_monitor"
            })
            logger.warning(f"SSH UNLOCK ATTACK from {ip}: {len(recent)} attempts/60s")


# ── Linux: Tail auth.log ────────────────────────────────────────────
async def tail_auth_log():
    """Tail /var/log/auth.log in real-time."""
    log_path = "/var/log/auth.log"
    if not Path(log_path).exists():
        log_path = "/var/log/secure"  # RHEL/CentOS
    if not Path(log_path).exists():
        logger.warning(f"auth.log not found at /var/log/auth.log or /var/log/secure")
        return

    logger.info(f"Tailing {log_path}")
    try:
        proc = await asyncio.create_subprocess_exec(
            "tail", "-n", "0", "-f", log_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            await process_line(line.decode("utf-8", errors="ignore").strip())
    except asyncio.CancelledError:
        proc.kill()
    except Exception as e:
        logger.error(f"auth.log tail error: {e}")


# ── Windows: Poll Event Log ─────────────────────────────────────────
async def poll_windows_event_log():
    """Poll Windows Event Log for SSH/SFTP events (Event ID 4625 = failed logon)."""
    logger.info("Polling Windows Event Log for SSH failures")
    seen_ids = set()
    while True:
        try:
            # Use PowerShell to query failed logons
            proc = await asyncio.create_subprocess_exec(
                "powershell", "-Command",
                "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4625} "
                "-MaxEvents 20 -ErrorAction SilentlyContinue | "
                "Select-Object TimeCreated,Message | ConvertTo-Json -Compress",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if stdout:
                try:
                    events = json.loads(stdout.decode("utf-8", errors="ignore"))
                    if not isinstance(events, list):
                        events = [events]
                    for ev in events:
                        ev_id = ev.get("TimeCreated", "")
                        if ev_id in seen_ids:
                            continue
                        seen_ids.add(ev_id)
                        msg = ev.get("Message", "")
                        # Extract IP from message
                        ip_match = re.search(r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})', msg)
                        if ip_match:
                            ip = ip_match.group(1)
                            failed_attempts[ip].append(time.time())
                            await check_brute_force(ip)
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            logger.warning(f"Windows event log poll error: {e}")

        await asyncio.sleep(15)


# ── Fallback: Simulated Log (for testing / when no real SSH) ────────
async def simulated_log_monitor():
    """Simulated SSH log monitoring for testing environments."""
    logger.info("Running in simulated mode (no real SSH logs)")
    while True:
        await asyncio.sleep(60)


# ── Main ────────────────────────────────────────────────────────────
async def main():
    global http_client

    http_client = HttpClient(
        config.ORCH,
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

    await post_event("system.heartbeat", {"agent": IDENTITY, "ip": "127.0.0.1", "status": "online"})
    logger.info("SSH Monitor online")

    is_linux = platform.system() == "Linux"
    has_auth_log = is_linux and (Path("/var/log/auth.log").exists() or Path("/var/log/secure").exists())

    try:
        if has_auth_log:
            await tail_auth_log()
        elif not is_linux:
            await poll_windows_event_log()
        else:
            await simulated_log_monitor()
    finally:
        await http_client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
