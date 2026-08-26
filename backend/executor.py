"""Shadow-Weaver Executor — real system execution layer.

Translates defense decisions into actual OS commands:
  - Linux: iptables, ufw, usermod, sshd_config
  - Windows: netsh advfirewall, net user

SAFETY: DRY_RUN=True by default — logs commands without executing.
Set EXECUTOR_DRY_RUN=False in .env to enable live execution.
"""
import asyncio
import logging
import os
import platform
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import config

logger = logging.getLogger("shadow.executor")
LOG_DIR = config.LOG_DIR / "executor"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── Platform Detection ──────────────────────────────────────────────
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"

# Protected IPs — never block these
PROTECTED_IPS = {"127.0.0.1", "::1", "0.0.0.0", config.ORCH.split("//")[-1].split(":")[0]}

# Protected user accounts — never disable these
PROTECTED_USERS = {"root", "Administrator", "shadow-admin", "tesko"}

# Audit log path
AUDIT_LOG = LOG_DIR / "executions.jsonl"


def _audit(entry: Dict[str, Any]):
    """Append execution record to audit log."""
    try:
        with open(AUDIT_LOG, "a") as f:
            import json
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def _run_cmd(cmd: List[str], timeout: int = 15) -> Tuple[int, str, str]:
    """Run a subprocess command. Returns (returncode, stdout, stderr).

    In DRY_RUN mode, logs the command but doesn't execute.
    """
    cmd_str = " ".join(cmd)
    dry_run = getattr(config, "EXECUTOR_DRY_RUN", True)

    if dry_run:
        logger.info(f"DRY_RUN: {cmd_str}")
        _audit({"ts": time.time(), "dry_run": True, "cmd": cmd_str,
                "returncode": 0, "stdout": "(dry run)", "stderr": ""})
        return 0, "(dry run)", ""

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0
        )
        _audit({"ts": time.time(), "dry_run": False, "cmd": cmd_str,
                "returncode": result.returncode,
                "stdout": result.stdout[:500], "stderr": result.stderr[:500]})
        if result.returncode != 0:
            logger.warning(f"cmd failed rc={result.returncode}: {cmd_str}\n  stderr: {result.stderr[:200]}")
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        logger.error(f"cmd timeout ({timeout}s): {cmd_str}")
        _audit({"ts": time.time(), "dry_run": False, "cmd": cmd_str,
                "returncode": -1, "stdout": "", "stderr": "timeout"})
        return -1, "", "timeout"
    except FileNotFoundError:
        logger.error(f"cmd not found: {cmd[0]}")
        _audit({"ts": time.time(), "dry_run": False, "cmd": cmd_str,
                "returncode": -2, "stdout": "", "stderr": "command not found"})
        return -2, "", "command not found"
    except Exception as e:
        logger.error(f"cmd error: {cmd_str} error={e}")
        _audit({"ts": time.time(), "dry_run": False, "cmd": cmd_str,
                "returncode": -3, "stdout": "", "stderr": str(e)})
        return -3, "", str(e)


# ── Firewall: IP Blocking ───────────────────────────────────────────

def block_ip(ip: str, reason: str = "", ttl: int = 0) -> bool:
    """Block an IP at the firewall level. Returns True if command succeeded."""
    if ip in PROTECTED_IPS:
        logger.warning(f"REFUSE block protected IP {ip}")
        return False

    if IS_WINDOWS:
        rule_name = f"ShadowWeaver-block-{ip.replace('.', '-')}"
        cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name}", "dir=in", "action=block",
            f"remoteip={ip}", "enable=yes"
        ]
    else:
        # Linux: try ufw first, fallback to iptables
        if _has_ufw():
            cmd = ["ufw", "deny", "from", ip]
        else:
            cmd = ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"]

    rc, stdout, stderr = _run_cmd(cmd)
    if rc == 0:
        logger.info(f"BLOCKED {ip} reason={reason}")
    return rc == 0


def unblock_ip(ip: str) -> bool:
    """Remove an IP block from the firewall. Returns True if command succeeded."""
    if IS_WINDOWS:
        rule_name = f"ShadowWeaver-block-{ip.replace('.', '-')}"
        cmd = [
            "netsh", "advfirewall", "firewall", "delete", "rule",
            f"name={rule_name}"
        ]
    else:
        if _has_ufw():
            cmd = ["ufw", "delete", "deny", "from", ip]
        else:
            cmd = ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"]

    rc, stdout, stderr = _run_cmd(cmd)
    if rc == 0:
        logger.info(f"UNBLOCKED {ip}")
    return rc == 0


# ── Firewall: Rate Limiting ─────────────────────────────────────────

def throttle_ip(ip: str, port: int = 80, rate: str = "10/min", duration: int = 30) -> bool:
    """Apply rate limiting to an IP on a specific port."""
    if ip in PROTECTED_IPS:
        logger.warning(f"REFUSE throttle protected IP {ip}")
        return False

    if IS_WINDOWS:
        # Windows: use rate limiting via netsh (limited support)
        rule_name = f"ShadowWeaver-throttle-{ip.replace('.', '-')}-{port}"
        cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name}", "dir=in", "action=allow",
            f"remoteip={ip}", f"protocol=tcp", f"localport={port}",
            "enable=yes"
        ]
        # Windows doesn't have native rate limiting, so we add allow + block rules
        _run_cmd(cmd)
        # Add block rule that will override after rate is exceeded
        block_rule = f"ShadowWeaver-throttle-block-{ip.replace('.', '-')}-{port}"
        cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={block_rule}", "dir=in", "action=block",
            f"remoteip={ip}", f"protocol=tcp", f"localport={port}",
            "enable=yes"
        ]
        rc, _, _ = _run_cmd(cmd)
    else:
        # Linux: iptables rate limit
        cmd = [
            "iptables", "-A", "INPUT", "-s", ip,
            "-p", "tcp", "--dport", str(port),
            "-m", "limit", "--limit", rate, "--limit-burst", "5",
            "-j", "ACCEPT"
        ]
        rc, _, _ = _run_cmd(cmd)
        if rc == 0:
            # Drop anything above the rate
            cmd = [
                "iptables", "-A", "INPUT", "-s", ip,
                "-p", "tcp", "--dport", str(port),
                "-j", "DROP"
            ]
            rc, _, _ = _run_cmd(cmd)

    if rc == 0:
        logger.info(f"THROTTLED {ip} port={port} rate={rate} duration={duration}s")
    return rc == 0


def remove_throttle(ip: str, port: int = 80) -> bool:
    """Remove rate limiting from an IP."""
    if IS_WINDOWS:
        rule_name = f"ShadowWeaver-throttle-block-{ip.replace('.', '-')}-{port}"
        cmd = [
            "netsh", "advfirewall", "firewall", "delete", "rule",
            f"name={rule_name}"
        ]
        rc, _, _ = _run_cmd(cmd)
        rule_name2 = f"ShadowWeaver-throttle-{ip.replace('.', '-')}-{port}"
        cmd2 = [
            "netsh", "advfirewall", "firewall", "delete", "rule",
            f"name={rule_name2}"
        ]
        _run_cmd(cmd2)
    else:
        # Remove both ACCEPT and DROP rules
        cmd_accept = [
            "iptables", "-D", "INPUT", "-s", ip,
            "-p", "tcp", "--dport", str(port),
            "-m", "limit", "--limit", "10/min", "--limit-burst", "5",
            "-j", "ACCEPT"
        ]
        cmd_drop = [
            "iptables", "-D", "INPUT", "-s", ip,
            "-p", "tcp", "--dport", str(port),
            "-j", "DROP"
        ]
        rc, _, _ = _run_cmd(cmd_accept)
        _run_cmd(cmd_drop)

    logger.info(f"UNTHROTTLED {ip} port={port}")
    return True


# ── Firewall: Tarpit ────────────────────────────────────────────────

def tarpit_ip(ip: str, port: int = 22) -> bool:
    """Apply TCP tarpit to an IP (holds connection open, wastes attacker resources)."""
    if ip in PROTECTED_IPS:
        logger.warning(f"REFUSE tarpit protected IP {ip}")
        return False

    if IS_WINDOWS:
        # Windows doesn't have TARPIT — use timeout instead
        rule_name = f"ShadowWeaver-tarpit-{ip.replace('.', '-')}"
        cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name}", "dir=in", "action=block",
            f"remoteip={ip}", f"protocol=tcp", f"localport={port}",
            "enable=yes"
        ]
    else:
        # Linux: iptables TARPIT target (kernel module)
        cmd = [
            "iptables", "-A", "INPUT", "-s", ip,
            "-p", "tcp", "--dport", str(port),
            "-j", "TARPIT"
        ]

    rc, stdout, stderr = _run_cmd(cmd)
    if rc == 0:
        logger.info(f"TARPIT {ip} port={port}")
    return rc == 0


# ── User Account Management ─────────────────────────────────────────

def disable_user(username: str, reason: str = "") -> bool:
    """Disable a user account (lock password + expire)."""
    if username in PROTECTED_USERS:
        logger.warning(f"REFUSE disable protected user {username}")
        return False

    if IS_WINDOWS:
        cmd = ["net", "user", username, "/active:no"]
    else:
        # Linux: lock password + expire account
        cmd_lock = ["usermod", "-L", username]
        cmd_expire = ["chage", "-E", "0", username]
        rc1, _, _ = _run_cmd(cmd_lock)
        rc2, _, _ = _run_cmd(cmd_expire)
        if rc1 == 0 or rc2 == 0:
            logger.info(f"DISABLED user {username} reason={reason}")
            return True
        return False

    rc, stdout, stderr = _run_cmd(cmd)
    if rc == 0:
        logger.info(f"DISABLED user {username} reason={reason}")
    return rc == 0


def enable_user(username: str) -> bool:
    """Re-enable a disabled user account."""
    if IS_WINDOWS:
        cmd = ["net", "user", username, "/active:yes"]
    else:
        cmd_unlock = ["usermod", "-U", username]
        cmd_expire = ["chage", "-E", "-1", username]
        rc1, _, _ = _run_cmd(cmd_unlock)
        rc2, _, _ = _run_cmd(cmd_expire)
        return rc1 == 0 or rc2 == 0

    rc, stdout, stderr = _run_cmd(cmd)
    return rc == 0


# ── SSH Hardening ────────────────────────────────────────────────────

def harden_ssh(max_auth_tries: int = 3, login_grace_time: int = 30) -> bool:
    """Harden SSH config: limit auth attempts, reduce grace time."""
    if IS_WINDOWS:
        logger.info("SSH hardening skipped on Windows (not applicable)")
        return True

    sshd_path = getattr(config, "SSH_CONFIG_PATH", "/etc/ssh/sshd_config")
    if not Path(sshd_path).exists():
        logger.warning(f"sshd_config not found at {sshd_path}")
        return False

    try:
        content = Path(sshd_path).read_text()
        lines = content.splitlines()
        new_lines = []
        changed = False

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("MaxAuthTries"):
                new_lines.append(f"MaxAuthTries {max_auth_tries}")
                changed = True
            elif stripped.startswith("LoginGraceTime"):
                new_lines.append(f"LoginGraceTime {login_grace_time}")
                changed = True
            else:
                new_lines.append(line)

        if not changed:
            # Append settings
            new_lines.append(f"\n# Shadow-Weaver hardening")
            new_lines.append(f"MaxAuthTries {max_auth_tries}")
            new_lines.append(f"LoginGraceTime {login_grace_time}")
            changed = True

        if not getattr(config, "EXECUTOR_DRY_RUN", True):
            Path(sshd_path).write_text("\n".join(new_lines) + "\n")
            # Reload sshd
            _run_cmd(["systemctl", "reload", "ssh"])
            _run_cmd(["systemctl", "reload", "sshd"])

        logger.info(f"SSH hardened: MaxAuthTries={max_auth_tries} LoginGraceTime={login_grace_time}")
        _audit({"ts": time.time(), "dry_run": getattr(config, "EXECUTOR_DRY_RUN", True),
                "cmd": f"ssh_harden max_auth={max_auth_tries} grace={login_grace_time}",
                "returncode": 0, "stdout": "config updated", "stderr": ""})
        return True
    except Exception as e:
        logger.error(f"SSH hardening failed: {e}")
        return False


# ── Utility: Check available tools ──────────────────────────────────

def _has_ufw() -> bool:
    """Check if ufw is available on the system."""
    if IS_WINDOWS:
        return False
    try:
        rc, _, _ = _run_cmd(["which", "ufw"])
        return rc == 0
    except Exception:
        return False


def _has_iptables() -> bool:
    """Check if iptables is available."""
    if IS_WINDOWS:
        return False
    try:
        rc, _, _ = _run_cmd(["which", "iptables"])
        return rc == 0
    except Exception:
        return False


def _has_nftables() -> bool:
    """Check if nftables is available."""
    if IS_WINDOWS:
        return False
    try:
        rc, _, _ = _run_cmd(["which", "nft"])
        return rc == 0
    except Exception:
        return False


def get_firewall_tool() -> str:
    """Detect the best available firewall tool."""
    if IS_WINDOWS:
        return "netsh"
    if _has_ufw():
        return "ufw"
    if _has_iptables():
        return "iptables"
    if _has_nftables():
        return "nftables"
    return "none"


# ── Playbook Execution ──────────────────────────────────────────────

async def apply_playbook(action: str, rule: str, ip: str = "",
                         target_user: str = "") -> bool:
    """Execute a playbook action with real system commands.

    Actions:
      - add_waf_rule / add_filter / log → no-op (handled by app layer)
      - lockout → block_ip
      - rate_limit → throttle_ip
      - enable_syn_cookies / tarpit → tarpit_ip
      - disable_weak_ciphers / disable_shell_endpoint → no-op (app config)
      - enable_mfa_prompt / enable_encoded_decode / enable_waf_paranoia → no-op
      - sanitize_headers / disable_user → disable_user
    """
    action = action.lower().strip()

    # Actions that don't require real system commands
    no_op_actions = {
        "add_waf_rule", "add_filter", "log", "disable_weak_ciphers",
        "disable_shell_endpoint", "enable_mfa_prompt", "enable_encoded_decode",
        "enable_waf_paranoia", "sanitize_headers"
    }

    if action in no_op_actions:
        logger.debug(f"PLAYBOOK_NOOP {action} (app-layer only)")
        return True

    if action == "lockout" and ip:
        return block_ip(ip, reason=rule)

    if action == "rate_limit" and ip:
        return throttle_ip(ip, port=80, rate="10/min")

    if action in ("enable_syn_cookies", "tarpit") and ip:
        return tarpit_ip(ip, port=22)

    if action == "disable_user" and target_user:
        return disable_user(target_user, reason=rule)

    logger.warning(f"PLAYBOOK_UNKNOWN {action} ip={ip} rule={rule}")
    return False


# ── Firewall Status ─────────────────────────────────────────────────

def get_blocked_ips() -> Dict[str, Any]:
    """List currently blocked IPs from the OS firewall."""
    blocked = {}
    if IS_WINDOWS:
        rc, stdout, _ = _run_cmd([
            "netsh", "advfirewall", "firewall", "show", "rule",
            "name=all", "dir=in"
        ])
        # Parse netsh output for ShadowWeaver rules
        current_rule = None
        for line in (stdout or "").splitlines():
            if "ShadowWeaver-block-" in line:
                # Extract IP from rule name
                parts = line.split("ShadowWeaver-block-")
                if len(parts) > 1:
                    ip_raw = parts[1].strip().split()[0]
                    ip = ip_raw.replace("-", ".")
                    blocked[ip] = {"source": "netsh", "ts": time.time()}
    else:
        rc, stdout, _ = _run_cmd(["iptables", "-L", "INPUT", "-n", "--line-numbers"])
        for line in (stdout or "").splitlines():
            if "DROP" in line and "tcp" not in line:
                parts = line.split()
                for p in parts:
                    if p.count(".") == 3:
                        blocked[p] = {"source": "iptables", "ts": time.time()}
    return blocked


def get_firewall_status() -> Dict[str, Any]:
    """Get overall firewall status."""
    tool = get_firewall_tool()
    blocked = get_blocked_ips()
    dry_run = getattr(config, "EXECUTOR_DRY_RUN", True)

    return {
        "tool": tool,
        "platform": platform.system(),
        "dry_run": dry_run,
        "blocked_ips": blocked,
        "blocked_count": len(blocked),
        "protected_ips": list(PROTECTED_IPS),
    }
