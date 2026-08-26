"""Shadow-Weaver Alerts — Discord/Slack webhook notifications.

Sends critical security alerts to configured channels.
Supports Discord, Slack, and generic webhook endpoints.
"""
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent))
import config
from http_client import HttpClient, CircuitBreakerOpen

logger = logging.getLogger("shadow.alerts")
IDENTITY = "alert_manager"

# ── Severity Levels ─────────────────────────────────────────────────
CRITICAL = "critical"    # IP blocked, account compromised
HIGH = "high"            # Brute force detected, auth spray
MEDIUM = "medium"        # Suspicious activity, rate limit
LOW = "low"              # Info: new detection, playbook applied

# Alert throttling — don't flood the same alert
ALERT_COOLDOWN = 60      # seconds between same-type alerts
alert_last_sent: Dict[str, float] = {}

http_client: HttpClient = None
alert_queue: asyncio.Queue = None

# ── Webhook URLs (from environment) ────────────────────────────────
DISCORD_WEBHOOK = os.environ.get("DISCORD_WEBHOOK_URL", "")
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL", "")
GENERIC_WEBHOOKS = [w.strip() for w in os.environ.get("GENERIC_WEBHOOKS", "").split(",") if w.strip()]


def _should_alert(alert_key: str) -> bool:
    """Check if we should send this alert (throttling)."""
    now = time.time()
    last = alert_last_sent.get(alert_key, 0)
    if now - last < ALERT_COOLDOWN:
        return False
    alert_last_sent[alert_key] = now
    return True


def _severity_emoji(severity: str) -> str:
    return {
        "critical": "🚨", "high": "⚠️", "medium": "🔶", "low": "ℹ️"
    }.get(severity, "❓")


def _format_discord(alert: Dict[str, Any]) -> Dict[str, Any]:
    """Format alert for Discord webhook."""
    severity = alert.get("severity", "medium")
    emoji = _severity_emoji(severity)
    title = alert.get("title", "Security Alert")
    description = alert.get("description", "")
    details = alert.get("details", {})

    fields = []
    for k, v in details.items():
        fields.append({"name": k, "value": str(v)[:100], "inline": True})

    embed = {
        "title": f"{emoji} {title}",
        "description": description,
        "color": {"critical": 0xFF0000, "high": 0xFF8800,
                  "medium": 0xFFCC00, "low": 0x00CCFF}.get(severity, 0x808080),
        "fields": fields,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "footer": {"text": "Shadow-Weaver Security"}
    }
    return {"embeds": [embed]}


def _format_slack(alert: Dict[str, Any]) -> Dict[str, Any]:
    """Format alert for Slack webhook."""
    severity = alert.get("severity", "medium")
    emoji = _severity_emoji(severity)
    title = alert.get("title", "Security Alert")
    description = alert.get("description", "")
    details = alert.get("details", {})

    fields_text = "\n".join(f"*{k}:* {str(v)[:100]}" for k, v in details.items())

    return {
        "attachments": [{
            "color": {"critical": "#FF0000", "high": "#FF8800",
                      "medium": "#FFCC00", "low": "#00CCFF"}.get(severity, "#808080"),
            "title": f"{emoji} {title}",
            "text": description,
            "fields": [{"title": k, "value": str(v)[:100], "short": True}
                       for k, v in details.items()],
            "footer": "Shadow-Weaver Security",
            "ts": int(time.time())
        }]
    }


def _format_generic(alert: Dict[str, Any]) -> Dict[str, Any]:
    """Format alert for generic webhook (JSON)."""
    return {
        "event": "security_alert",
        "severity": alert.get("severity", "medium"),
        "title": alert.get("title", ""),
        "description": alert.get("description", ""),
        "details": alert.get("details", {}),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "shadow-weaver"
    }


async def _send_webhook(url: str, payload: Dict[str, Any], webhook_type: str):
    """Send a single webhook."""
    if http_client is None:
        return
    try:
        # Create a temporary client for external webhooks
        async with HttpClient(url, timeout_total=10, retry_attempts=1) as client:
            await client.post("", json_data=payload)
        logger.debug(f"Webhook sent to {webhook_type}: {url[:50]}...")
    except Exception as e:
        logger.warning(f"Webhook failed ({webhook_type}): {e}")


async def send_alert(severity: str, title: str, description: str,
                     details: Optional[Dict[str, Any]] = None,
                     event_type: str = ""):
    """Send a security alert to all configured channels.

    Args:
        severity: critical, high, medium, low
        title: Alert title
        description: Human-readable description
        details: Key-value pairs for additional context
        event_type: For throttling (e.g., 'ssh_bruteforce')
    """
    alert_key = event_type or title
    if not _should_alert(alert_key):
        logger.debug(f"Alert throttled: {alert_key}")
        return

    alert = {
        "severity": severity,
        "title": title,
        "description": description,
        "details": details or {},
        "event_type": event_type,
        "timestamp": time.time()
    }

    # Queue for async processing
    if alert_queue:
        await alert_queue.put(alert)
    else:
        await _process_alert(alert)


async def _process_alert(alert: Dict[str, Any]):
    """Send alert to all configured webhooks."""
    tasks = []

    if DISCORD_WEBHOOK:
        payload = _format_discord(alert)
        tasks.append(_send_webhook(DISCORD_WEBHOOK, payload, "discord"))

    if SLACK_WEBHOOK:
        payload = _format_slack(alert)
        tasks.append(_send_webhook(SLACK_WEBHOOK, payload, "slack"))

    for url in GENERIC_WEBHOOKS:
        payload = _format_generic(alert)
        tasks.append(_send_webhook(url, payload, "generic"))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

    # Also log locally
    severity = alert.get("severity", "medium")
    log_msg = f"ALERT [{severity.upper()}] {alert['title']}: {alert['description']}"
    if severity in ("critical", "high"):
        logger.warning(log_msg)
    else:
        logger.info(log_msg)


# ── Pre-built Alert Templates ───────────────────────────────────────

async def alert_ip_blocked(ip: str, reason: str, decision: str = "autonomous"):
    """Critical: IP has been blocked."""
    await send_alert(
        severity=CRITICAL,
        title="IP Blocked",
        description=f"IP {ip} has been blocked at firewall level.",
        details={"IP": ip, "Reason": reason, "Decision": decision,
                 "Action": "Firewall rule added"},
        event_type="ip_blocked"
    )


async def alert_brute_force(ip: str, attempts: int, window: int, users: List[str]):
    """High: SSH brute force detected."""
    await send_alert(
        severity=HIGH,
        title="SSH Brute Force Detected",
        description=f"{attempts} failed SSH attempts from {ip} in {window}s",
        details={"IP": ip, "Attempts": attempts, "Window": f"{window}s",
                 "Users Targeted": ", ".join(users[:5])},
        event_type="ssh_bruteforce"
    )


async def alert_auth_spray(ip: str, users: List[str], window: int):
    """High: Authentication spray detected."""
    await send_alert(
        severity=HIGH,
        title="Authentication Spray Detected",
        description=f"{len(users)} distinct user accounts targeted from {ip}",
        details={"IP": ip, "User Count": len(users),
                 "Users": ", ".join(users[:10]), "Window": f"{window}s"},
        event_type="auth_spray"
    )


async def alert_multi_vector(ip: str, attack_chain: List[str]):
    """Critical: Multi-vector attack correlation."""
    await send_alert(
        severity=CRITICAL,
        title="Multi-Vector Attack Detected",
        description=f"Correlated attack chain from {ip}: {' + '.join(attack_chain)}",
        details={"IP": ip, "Attack Chain": " + ".join(attack_chain),
                 "Vector Count": len(attack_chain)},
        event_type="multi_vector"
    )


async def alert_account_disabled(username: str, reason: str):
    """High: User account has been disabled."""
    await send_alert(
        severity=HIGH,
        title="Account Disabled",
        description=f"User account '{username}' has been disabled.",
        details={"User": username, "Reason": reason},
        event_type="account_disabled"
    )


async def alert_honeypot_triggered(ip: str, session: str, commands: int):
    """Medium: Honeypot session triggered."""
    await send_alert(
        severity=MEDIUM,
        title="Honeypot Triggered",
        description=f"Decoy SSH session from {ip} with {commands} commands executed.",
        details={"IP": ip, "Session": session, "Commands": commands},
        event_type="honeypot_triggered"
    )


async def alert_system_event(agent: str, status: str, message: str = ""):
    """Low: System event (startup, shutdown, etc.)."""
    await send_alert(
        severity=LOW,
        title=f"System: {agent} {status}",
        description=message or f"{agent} is now {status}",
        details={"Agent": agent, "Status": status},
        event_type=f"system_{agent}"
    )


# ── Alert Processor (background task) ───────────────────────────────

async def _alert_processor():
    """Background task that processes queued alerts."""
    while True:
        try:
            alert = await alert_queue.get()
            await _process_alert(alert)
            alert_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Alert processor error: {e}")


# ── Integration with Orchestrator ───────────────────────────────────

async def process_telemetry_event(etype: str, data: dict):
    """Process telemetry events and generate alerts as needed.

    Called by orchestrator when events are recorded.
    """
    ip = data.get("ip", "")
    severity = data.get("severity", 0)

    if etype == "shield.block" and ip:
        await alert_ip_blocked(ip, data.get("reason", ""), data.get("decision", ""))

    elif etype == "ssh.bruteforce":
        await alert_brute_force(ip, data.get("attempts", 0),
                                data.get("window", 0),
                                data.get("users_targeted", []))

    elif etype == "ssh.auth_spray":
        await alert_auth_spray(ip, data.get("distinct_users", []),
                               data.get("window", 0))

    elif etype == "shield.correlation":
        await alert_multi_vector(ip, data.get("chain", []))

    elif etype == "honeypot.intel" and data.get("severity", 0) >= 7:
        await alert_honeypot_triggered(ip, data.get("session", ""),
                                       data.get("commands", 0))


# ── Main ────────────────────────────────────────────────────────────

async def main():
    """Standalone alert manager (listens to orchestrator events via WebSocket)."""
    global http_client, alert_queue

    alert_queue = asyncio.Queue()
    processor = asyncio.create_task(_alert_processor())

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

    await alert_system_event(IDENTITY, "online", "Alert manager started")
    logger.info("Alert Manager online")

    # Poll orchestrator for events
    while True:
        try:
            status = await http_client.get("/api/v1/status")
            events = status.get("events", 0)
            await asyncio.sleep(30)
        except Exception:
            await asyncio.sleep(60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
