import asyncio
import json
import logging
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import config
from http_client import HttpClient, CircuitBreakerOpen

logger = logging.getLogger("shadow.honeypot")

ORCH = config.ORCH
IDENTITY = "honeypot.jail"
SELF_IP = config.HONEY_IP
HONEY_PORT = config.HONEY_PORT
BANNER = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6"
AUTH_CREDS = {"root": ["shadow", "toor", "admin"]}
MAX_AUTH_TRIES = getattr(config, "HONEY_AUTH_ATTEMPTS", 3)
IDLE_TIMEOUT = getattr(config, "HONEY_IDLE_TIMEOUT", 30)
MAX_COMMANDS = getattr(config, "DECOY_MAX_COMMANDS", 12)
HIGH_SEV = 7
LOG_PATH = config.LOG_DIR / "sw_honey.log"

http_client: HttpClient = None

# Decoy filesystem: virtual dirs + file contents
FAKE_DIRS = {
    "/": ["etc", "opt", "root", "tmp", "home", "var"],
    "/etc": ["passwd", "shadow", "hostname", "os-release", "nginx"],
    "/etc/nginx": ["nginx.conf"],
    "/root": ["backup.sh", "notes.txt", "flag.txt", "secret.txt", ".ssh"],
    "/root/.ssh": ["id_rsa", "config", "known_hosts"],
    "/opt": ["backups"],
    "/opt/backups": ["db.tgz", "app.old.tar"],
    "/tmp": [],
    "/home": ["admin"],
    "/home/admin": [".bashrc", "todo.txt"],
    "/var": ["log", "backups"],
    "/var/log": ["syslog", "auth.log"],
}

FAKE_FS = {
    "/etc/passwd": "root:x:0:0:root:/root:/bin/bash\nadmin:x:1000:1000:Admin:/home/admin:/bin/bash",
    "/etc/shadow": "root:$6$p4Y0sH1ft$H9kZ2qWv0xLmNpR4tU7yA1cE3gI5jK8s:19000:0:99999:7:::",
    "/etc/hostname": "shadow-node-03",
    "/etc/os-release": 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy',
    "/etc/nginx/nginx.conf": (
        "server {\n"
        "    listen 80;\n"
        "    location /api/ { proxy_pass http://192.168.50.20:8080; }\n"
        "    # lab note: backend trusts X-Agent-IP header for internal traffic\n"
        "}"),
    "/root/backup.sh": "#!/bin/bash\ntar czf /opt/backups/db.tgz /var/lib/mysql",
    "/root/notes.txt": "TODO: rotate db creds before Monday",
    "/root/flag.txt": "SW-HACK{shadow_weaver_rooted_2026}",
    "/root/secret.txt": "STAGING-API-KEY=sk-live-9f8e7d6c5b4a3",
    "/root/.ssh/id_rsa": (
        "-----BEGIN OPENSSH PRIVATE KEY-----\n"
        "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAABN...eY=\n"
        "-----END OPENSSH PRIVATE KEY-----"),
    "/root/.ssh/config": (
        "Host blue-node-02\n"
        "    HostName 192.168.50.20\n"
        "    User admin\n"
        "    IdentityFile ~/.ssh/id_rsa"),
    "/root/.ssh/known_hosts": "192.168.50.20 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...",
    "/root/.bash_history": (
        "ssh admin@192.168.50.20\n"
        "curl http://192.168.50.20/api/config\n"
        "whoami\n"
        "ls -la /opt/backups"),
    "/opt/backups/db.tgz": "gzip compressed data (simulated)",
    "/opt/backups/app.old.tar": "tar archive (simulated stale build)",
    "/home/admin/todo.txt": "deploy new API keys - ask blue-team node admin",
    "/home/admin/.bashrc": "alias ll='ls -la'\nexport PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin",
    "/var/log/auth.log": "Jun 12 02:14:03 sshd[1402]: Failed password for root from 10.0.0.77",
}

SYSTEM_CMDS = {
    "whoami": "root",
    "id": "uid=0(root) gid=0(root) groups=0(root)",
    "pwd": "/root",
    "uname -a": "Linux shadow-node-03 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux",
    "ifconfig": "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.50.30  netmask 255.255.255.0",
    "cat /proc/version": "Linux version 5.15.0-91-generic (buildd@lgw01) gcc-11",
}

# Command classification: (regex, category, ATT&CK, severity, alert msg)
INTEL_PATTERNS = [
    (r"dirty.?pipe|cve-2022-0847|cve-2021-4034|pwnkit|exploit",
     "exploit_attempt", "T1068", 9, "known CVE exploit attempt"),
    (r"wget|curl|nc\s|netcat|python3\s+-c|bash\s+-i|/dev/tcp",
     "payload_download", "T1105", 9, "payload download / reverse shell"),
    (r"ssh\s|scp\s|sftp\s|rlogin\s",
     "lateral_movement", "T1021", 9, "lateral movement attempt"),
    (r"sudo|su\s|useradd|adduser|passwd|chmod\s+4777|chown\s+root",
     "privilege_escalation", "T1068", 9, "privilege escalation attempt"),
    (r"cat\s+/etc/shadow|cat\s+/etc/passwd|id_rsa|\.ssh|find\s+/.*key",
     "credential_hunt", "T1003", 8, "credential hunt"),
    (r"flag\.txt|secret\.txt|secret\.flag",
     "exfiltration", "T1041", 8, "sensitive data access"),
    (r"crontab|systemctl|rc\.local|\.bashrc|persist",
     "persistence", "T1543", 7, "persistence attempt"),
    (r"uname|os-release|proc/version|ifconfig|hostname",
     "os_fingerprint", "T1082", 3, "OS fingerprinting"),
    (r"whoami|\bid\b|users\b|last\b|w\b",
     "user_enumeration", "T1033", 4, "user enumeration"),
    (r"history|\.bash_history",
     "recon_history", "T1083", 3, "history reconnaissance"),
]


def log(msg):
    try:
        with LOG_PATH.open("a") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


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


def classify(cmd):
    for pat, cat, attck, sev, msg in INTEL_PATTERNS:
        if re.search(pat, cmd, re.IGNORECASE):
            return cat, attck, sev, msg
    return None


def resolve(path, cwd):
    if not path:
        return cwd
    if not path.startswith("/"):
        path = cwd.rstrip("/") + "/" + path
    parts = []
    for seg in path.split("/"):
        if seg in ("", "."):
            continue
        if seg == "..":
            if parts:
                parts.pop()
            continue
        parts.append(seg)
    return "/" + "/".join(parts)


def ls_dir(path):
    names = FAKE_DIRS.get(path)
    if names is None:
        return None
    return "  ".join(names)


class DecoySession:
    def __init__(self, peer):
        self.session = f"sess-{int(time.time())}"
        self.peer = str(peer)
        self.cwd = "/root"
        self.history = []
        self.cmd_count = 0
        self.alerts = []
        self.start = time.time()

    async def emit_intel(self, category, attck, sev, msg, command):
        ev = {"session": self.session, "command": command,
              "category": category, "attack_technique": attck,
              "severity": sev, "confidence": 0.9 if sev >= 8 else 0.8,
              "alert": msg}
        await post("honeypot.intel", ev)
        log(f"INTEL {self.session} {category} sev={sev} attck={attck} cmd={command}")
        if sev >= HIGH_SEV:
            self.alerts.append(ev)

    async def emit_alert(self):
        if len(self.alerts) < 3:
            return
        await post("honeypot.alert", {
            "session": self.session,
            "alerts": len(self.alerts),
            "attack_techniques": sorted({a["attack_technique"] for a in self.alerts}),
            "chain": sorted({a["category"] for a in self.alerts})})
        log(f"ALERT {self.session} multi-signal {len(self.alerts)} high-sev actions")

    async def exec(self, raw):
        cmd = raw.strip()
        if not cmd:
            return ""
        self.history.append(cmd)
        self.cmd_count += 1

        info = classify(cmd)
        if info:
            cat, attck, sev, msg = info
            await self.emit_intel(cat, attck, sev, msg, cmd)

        parts = re.split(r"\s*(?:&&|\|\||;)\s*", cmd)
        outputs = [self._run_one(p) for p in parts if p.strip()]
        return "\n".join(o for o in outputs if o)

    def _run_one(self, cmd):
        toks = cmd.split()
        head = toks[0]
        if head == "cd":
            target = toks[1] if len(toks) > 1 else "/root"
            if target in ("~",):
                target = "/root"
            dest = resolve(target, self.cwd)
            if dest in FAKE_DIRS:
                self.cwd = dest
                return ""
            return f"bash: cd: {target}: No such file or directory"
        if head == "ls":
            path = self.cwd
            for t in toks[1:]:
                if t.startswith("-"):
                    continue
                path = resolve(t, self.cwd)
            listing = ls_dir(path)
            if listing is None:
                return f"ls: cannot access '{path}': No such file or directory"
            if any(t in ("-l", "-la", "-l -a") for t in toks[1:]):
                listing = "drwxr-xr-x  root root  " + listing
            return listing
        if head == "cat":
            if len(toks) < 2:
                return "usage: cat <file>"
            path = resolve(toks[1], self.cwd)
            return FAKE_FS.get(path, f"cat: {toks[1]}: No such file or directory")
        if head == "echo":
            return cmd[5:].strip().strip('"').strip("'")
        if head == "history":
            return "\n".join(f"  {i}  {c}" for i, c in enumerate(self.history, 1))
        if head == "clear":
            return ""
        if head in ("exit", "quit", "logout"):
            return None
        if head == "find":
            if "flag" in cmd:
                return "/root/flag.txt\n/opt/secret.flag"
            return "/root\n/etc\n/opt"
        if head == "pwd":
            return self.cwd
        return SYSTEM_CMDS.get(cmd, "bash: command not found")


async def handle_client(reader, writer):
    peer = writer.get_extra_info("peername")
    s = DecoySession(peer)
    await post("honeypot.session", {"session": s.session, "peer": str(peer),
                              "note": "attacker connected to decoy node"})
    log(f"SESSION {s.session} OPEN peer={peer}")
    try:
        writer.write(f"{BANNER}\r\n".encode())
        await writer.drain()
        writer.write(b"root@shadow-node-03's password: ")
        await writer.drain()

        authed = False
        tries = 0
        while tries < MAX_AUTH_TRIES:
            line = await asyncio.wait_for(reader.readline(), IDLE_TIMEOUT)
            if not line:
                return
            pwd = line.decode(errors="ignore").strip()
            tries += 1
            if pwd in AUTH_CREDS["root"]:
                authed = True
                log(f"AUTH {s.session} success (root/{pwd})")
                break
            await s.emit_intel("auth_brute", "T1110", 8, "SSH password brute force", f"password:{pwd}")
            writer.write(b"Permission denied, please try again.\r\nroot@shadow-node-03's password: ")
            await writer.drain()
        if not authed:
            writer.write(b"Permission denied (publickey,password).\r\n")
            await writer.drain()
            log(f"AUTH {s.session} denied after {tries} tries")
            return

        while True:
            writer.write(f"root@shadow-node-03:{s.cwd}# ".encode())
            await writer.drain()
            line = await asyncio.wait_for(reader.readline(), IDLE_TIMEOUT)
            if not line:
                break
            cmd = line.decode(errors="ignore").strip()
            if not cmd:
                continue
            info = classify(cmd)
            await post("honeypot.frame", {
                "session": s.session, "command": cmd, "peer": str(peer),
                "classified": (info[0] + "/" + info[1] if info else "benign")})
            log(f"FRAME {s.session} cmd={cmd}")
            if cmd.lower() in ("exit", "quit", "logout"):
                writer.write(b"logout\r\nConnection to shadow-node-03 closed.\r\n")
                await writer.drain()
                break
            if s.cmd_count >= MAX_COMMANDS:
                await s.emit_intel("session_abuse", "T1562", 6,
                             "excessive command activity", cmd)
                writer.write(b"Session terminated: command limit reached (defense response).\r\n")
                await writer.drain()
                log(f"TERMINATE {s.session} command limit {MAX_COMMANDS}")
                break
            out = await s.exec(cmd)
            if out is None:
                writer.write(b"logout\r\nConnection to shadow-node-03 closed.\r\n")
                await writer.drain()
                break
            if out:
                writer.write(f"{out}\r\n".encode())
            await writer.drain()
        await s.emit_alert()
    except asyncio.TimeoutError:
        log(f"SESSION {s.session} idle timeout")
        await s.emit_alert()
    except Exception:
        await s.emit_alert()
    await post("honeypot.session", {"session": s.session, "peer": str(peer),
                              "note": "session closed",
                              "commands": s.cmd_count,
                              "duration": round(time.time() - s.start, 1)})
    await post("honeypot.summary", {
        "session": s.session, "commands": s.cmd_count,
        "intel": len(s.alerts),
        "categories": sorted({a["category"] for a in s.alerts}),
        "duration": round(time.time() - s.start, 1),
        "source": str(peer)})
    log(f"SESSION {s.session} CLOSE commands={s.cmd_count} intel={len(s.alerts)}")
    writer.close()


async def main():
    global http_client
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
    server = await asyncio.start_server(handle_client, "127.0.0.1", HONEY_PORT)
    print(f"Honeypot jail on port {HONEY_PORT} (fake SSH decoy, v2)")
    await post("system.heartbeat", {"agent": "honeypot.jail", "ip": SELF_IP,
                              "status": "armed", "port": HONEY_PORT})
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())