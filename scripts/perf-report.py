#!/usr/bin/env python3
"""EcoBrains LMS — VPS performance snapshot and report.

Collects host, systemd, Nginx, MySQL, journal, and live HTTP probe metrics,
then writes Markdown + HTML reports. Stdlib only (no pip packages).

Usage (on the VPS):
  sudo python3 scripts/perf-report.py
  sudo python3 scripts/perf-report.py --hours 6 --probes 10
  sudo ./scripts/perf-report.sh
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import statistics
import subprocess
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import Any

ACCESS_RE = re.compile(
    r"^(\S+) \S+ \S+ \[([^\]]+)\] \"(\S+) (\S+)[^\"]*\" (\d{3}) (\S+)"
    r"(?: \".*?\" \".*?\")?(?: ([\d.]+))?(?: ([\d.-]+))?"
)
ENV_LINE_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")
EXAM_TOKENS = ("/api/student/exam", "save-progress", "/start", "/submit", "time-status")


def run(cmd: list[str], timeout: int = 20) -> str:
    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return (result.stdout or "") + (result.stderr or "")
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return f"(unavailable: {exc})"


def run_ok(cmd: list[str], timeout: int = 20) -> tuple[int, str]:
    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, (result.stdout or "").strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return 1, str(exc)


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = ENV_LINE_RE.match(line)
        if not match:
            continue
        key, val = match.group(1), match.group(2).strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        values[key] = val
    return values


def parse_dt(stamp: str) -> datetime | None:
    try:
        return datetime.strptime(stamp.split()[0], "%d/%b/%Y:%H:%M:%S")
    except ValueError:
        return None


def human_bytes(num: float) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    value = float(num)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}"
        value /= 1024
    return f"{num:.0f} B"


def pct(part: int, whole: int) -> str:
    if whole <= 0:
        return "0.0%"
    return f"{100.0 * part / whole:.1f}%"


def read_meminfo() -> dict[str, int]:
    info: dict[str, int] = {}
    path = Path("/proc/meminfo")
    if not path.is_file():
        return info
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split()
        if len(parts) >= 2:
            info[parts[0].rstrip(":")] = int(parts[1]) * 1024
    return info


def collect_host() -> dict[str, Any]:
    load1 = load5 = load15 = 0.0
    try:
        load1, load5, load15 = os.getloadavg()
    except OSError:
        pass
    cpu = os.cpu_count() or 1
    mem = read_meminfo()
    total = mem.get("MemTotal", 0)
    avail = mem.get("MemAvailable", mem.get("MemFree", 0))
    swap_t = mem.get("SwapTotal", 0)
    swap_f = mem.get("SwapFree", 0)
    disk = shutil.disk_usage("/")
    uptime = run(["uptime", "-p"]).strip()
    uname = run(["uname", "-a"]).strip()
    return {
        "hostname": socket.gethostname(),
        "time": datetime.now().astimezone().isoformat(timespec="seconds"),
        "uname": uname,
        "uptime": uptime,
        "cpu_count": cpu,
        "load": {"1": load1, "5": load5, "15": load15},
        "load_per_cpu": round(load1 / cpu, 2) if cpu else 0,
        "memory_total": total,
        "memory_available": avail,
        "memory_used_pct": round(100.0 * (total - avail) / total, 1) if total else 0,
        "swap_total": swap_t,
        "swap_used": swap_t - swap_f,
        "disk_total": disk.total,
        "disk_used": disk.used,
        "disk_used_pct": round(100.0 * disk.used / disk.total, 1) if disk.total else 0,
    }


def service_active(name: str) -> str:
    code, out = run_ok(["systemctl", "is-active", name])
    return out if out else ("inactive" if code else "unknown")


def collect_services(backend: str) -> dict[str, Any]:
    names = [backend, "nginx", "mysql", "mariadb"]
    states = {}
    for name in names:
        states[name] = service_active(name)
    if states.get("mariadb") == "active" and states.get("mysql") != "active":
        states["mysql"] = "active (mariadb)"
    pid = run(["systemctl", "show", "-p", "MainPID", "--value", backend]).strip()
    memory = run(["systemctl", "show", "-p", "MemoryCurrent", "--value", backend]).strip()
    n_restarts = run(["systemctl", "show", "-p", "NRestarts", "--value", backend]).strip()
    java = {}
    if pid.isdigit() and int(pid) > 0:
        rss = run(["ps", "-o", "rss=", "-p", pid]).strip()
        pcpu = run(["ps", "-o", "pcpu=", "-p", pid]).strip()
        etime = run(["ps", "-o", "etime=", "-p", pid]).strip()
        java = {
            "pid": pid,
            "rss_bytes": int(rss) * 1024 if rss.isdigit() else 0,
            "cpu_pct": pcpu,
            "etime": etime,
        }
    return {
        "states": states,
        "backend_pid": pid,
        "backend_memory_current": memory,
        "backend_nrestarts": n_restarts,
        "java": java,
    }


def collect_probes(port: int, count: int) -> dict[str, Any]:
    targets = {
        "frontend_http": "http://127.0.0.1/",
        "backend_public_api": f"http://127.0.0.1:{port}/api/admin/courses/public",
        "backend_health": f"http://127.0.0.1:{port}/actuator/health",
    }
    probes: dict[str, Any] = {}
    for name, url in targets.items():
        samples: list[float] = []
        codes: list[str] = []
        for _ in range(count):
            code, out = run_ok(
                [
                    "curl",
                    "-sS",
                    "-o",
                    "/dev/null",
                    "-w",
                    "%{http_code} %{time_total}",
                    "--max-time",
                    "8",
                    url,
                ],
                timeout=12,
            )
            parts = out.split()
            if len(parts) == 2:
                codes.append(parts[0])
                try:
                    samples.append(float(parts[1]))
                except ValueError:
                    pass
            else:
                codes.append("000")
            time.sleep(0.05)
        ok = sum(1 for c in codes if c.startswith("2") or c.startswith("3"))
        probes[name] = {
            "url": url,
            "ok": ok,
            "n": count,
            "codes": dict(Counter(codes)),
            "latency_ms_avg": round(1000 * statistics.mean(samples), 1) if samples else None,
            "latency_ms_p95": round(1000 * statistics.quantiles(samples, n=20)[18], 1)
            if len(samples) >= 20
            else (round(1000 * max(samples), 1) if samples else None),
            "latency_ms_max": round(1000 * max(samples), 1) if samples else None,
        }
    return probes


def collect_journal(unit: str, hours: int) -> dict[str, Any]:
    since = f"{hours} hours ago"
    text = run(["journalctl", "-u", unit, "--since", since, "-p", "err", "-n", "40", "--no-pager"])
    restart_text = run(
        ["journalctl", "-u", unit, "--since", since, "--no-pager", "-g", "Failed|CHDIR|OutOfMemory|Exception"]
    )
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("--")]
    return {
        "error_lines": lines[-30:],
        "restart_hint": [ln for ln in restart_text.splitlines() if ln.strip()][-15:],
        "error_count": len(lines),
    }


def collect_nginx_errors(path: Path, limit: int = 40) -> list[str]:
    if not path.is_file():
        return [f"(missing {path})"]
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return [str(exc)]
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[-limit:]


def analyze_access_log(path: Path, max_lines: int, since: datetime | None) -> dict[str, Any]:
    empty = {
        "path": str(path),
        "parsed": 0,
        "unique_ips": 0,
        "status": {},
        "errors_4xx": 0,
        "errors_5xx": 0,
        "gateway": 0,
        "peak_rps": 0,
        "peak_rps_at": None,
        "peak_rpm": 0,
        "peak_rpm_at": None,
        "top_paths": [],
        "exam": {},
        "latency": {},
        "concurrent_exam_30s": 0,
        "concurrent_at": None,
        "skipped": False,
        "note": "",
    }
    if not path.is_file():
        empty["skipped"] = True
        empty["note"] = f"log not found: {path}"
        return empty

    entries: list[dict[str, Any]] = []
    latencies: list[float] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            if max_lines > 0:
                # Efficient tail for large logs
                handle.seek(0, os.SEEK_END)
                size = handle.tell()
                handle.seek(max(0, size - max_lines * 250), os.SEEK_SET)
                handle.readline()
            for line in handle:
                match = ACCESS_RE.match(line.strip())
                if not match:
                    continue
                ip, stamp, method, req_path, status_s, _size, t1, t2 = match.groups()
                dt = parse_dt(stamp)
                if dt is None:
                    continue
                if since and dt < since:
                    continue
                status = int(status_s)
                path_only = req_path.split("?", 1)[0]
                row = {"ip": ip, "dt": dt, "method": method, "path": path_only, "status": status}
                entries.append(row)
                for raw in (t1, t2):
                    if raw and re.fullmatch(r"[\d.]+", raw):
                        latencies.append(float(raw))
                        break
    except OSError as exc:
        empty["skipped"] = True
        empty["note"] = str(exc)
        return empty

    if not entries:
        empty["note"] = "no parseable lines in window"
        return empty

    status_counts = Counter(e["status"] for e in entries)
    rps = Counter(e["dt"] for e in entries)
    rpm = Counter(e["dt"].replace(second=0, microsecond=0) for e in entries)
    peak_sec, peak_sec_n = rps.most_common(1)[0]
    peak_min, peak_min_n = rpm.most_common(1)[0]
    path_counts = Counter(e["path"] for e in entries)

    exam = [e for e in entries if any(tok in e["path"] for tok in EXAM_TOKENS)]
    save_p = [e for e in exam if "save-progress" in e["path"]]
    windows: dict[datetime, set[str]] = defaultdict(set)
    for e in save_p:
        bucket = e["dt"].replace(second=(e["dt"].second // 30) * 30, microsecond=0)
        windows[bucket].add(e["ip"])
    conc_n, conc_at = (0, None)
    if windows:
        at, ips = max(windows.items(), key=lambda item: len(item[1]))
        conc_n, conc_at = len(ips), at.isoformat(timespec="seconds")

    latency = {}
    if latencies:
        latency = {
            "count": len(latencies),
            "avg_ms": round(1000 * statistics.mean(latencies), 1),
            "p95_ms": round(1000 * statistics.quantiles(latencies, n=20)[18], 1)
            if len(latencies) >= 20
            else round(1000 * max(latencies), 1),
            "max_ms": round(1000 * max(latencies), 1),
        }

    return {
        "path": str(path),
        "parsed": len(entries),
        "unique_ips": len({e["ip"] for e in entries}),
        "status": dict(sorted(status_counts.items())),
        "errors_4xx": sum(n for s, n in status_counts.items() if 400 <= s < 500),
        "errors_5xx": sum(n for s, n in status_counts.items() if s >= 500),
        "gateway": sum(status_counts[s] for s in (502, 503, 504) if s in status_counts),
        "peak_rps": peak_sec_n,
        "peak_rps_at": peak_sec.isoformat(timespec="seconds"),
        "peak_rpm": peak_min_n,
        "peak_rpm_at": peak_min.isoformat(timespec="seconds"),
        "top_paths": path_counts.most_common(12),
        "exam": {
            "requests": len(exam),
            "save_progress": len(save_p),
            "starts": sum(1 for e in exam if e["path"].endswith("/start")),
            "submits": sum(1 for e in exam if e["path"].endswith("/submit")),
            "unique_ips": len({e["ip"] for e in exam}),
        },
        "latency": latency,
        "concurrent_exam_30s": conc_n,
        "concurrent_at": conc_at,
        "skipped": False,
        "note": "",
        "from": min(e["dt"] for e in entries).isoformat(timespec="seconds"),
        "to": max(e["dt"] for e in entries).isoformat(timespec="seconds"),
    }


def mysql_exec(env: dict[str, str], sql: str) -> tuple[bool, str]:
    user = env.get("MYSQL_USER") or env.get("SPRING_DATASOURCE_USERNAME")
    password = env.get("MYSQL_PASSWORD") or env.get("SPRING_DATASOURCE_PASSWORD")
    database = env.get("MYSQL_DATABASE", "")
    host = env.get("MYSQL_HOST", "127.0.0.1")
    port = env.get("MYSQL_PORT", "3306")
    if not user:
        return False, "no MYSQL_USER in .env"
    cmd = ["mysql", f"-h{host}", f"-P{port}", f"-u{user}", "-N", "-e", sql]
    if database:
        cmd.insert(1, f"-D{database}")
    env_run = os.environ.copy()
    if password:
        env_run["MYSQL_PWD"] = password
    try:
        result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=20, env=env_run)
        if result.returncode == 0:
            return True, (result.stdout or "").strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError) as exc:
        return False, str(exc)
    code2, out2 = run_ok(
        ["mysql", "--protocol=socket", "-uroot", f"-D{database}", "-N", "-e", sql] if database
        else ["mysql", "--protocol=socket", "-uroot", "-N", "-e", sql],
        timeout=20,
    )
    if code2 != 0:
        return False, (out2 or "mysql connect failed")
    return True, out2


def mysql_table(env: dict[str, str], sql: str) -> list[list[str]]:
    ok, text = mysql_exec(env, sql)
    if not ok or not text:
        return []
    return [line.split("\t") for line in text.splitlines() if line.strip()]


def collect_mysql(env: dict[str, str]) -> dict[str, Any]:
    sql = (
        "SHOW GLOBAL STATUS WHERE Variable_name IN "
        "('Threads_connected','Threads_running','Slow_queries','Questions',"
        "'Uptime','Aborted_connects','Max_used_connections');"
        "SHOW VARIABLES WHERE Variable_name IN ('max_connections','innodb_buffer_pool_size');"
    )
    ok, out = mysql_exec(env, sql)
    if not ok:
        return {"skipped": True, "note": out}
    stats: dict[str, str] = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            stats[parts[0]] = parts[1]
    return {"skipped": False, "database": env.get("MYSQL_DATABASE", ""), "stats": stats}


def collect_app(env: dict[str, str], hours: int) -> dict[str, Any]:
    """Workload from tables the LMS already writes (no Actuator/Micrometer in the app)."""
    hours = max(1, min(int(hours), 168))
    probe = mysql_table(env, "SHOW TABLES LIKE 'activity_logs'")
    if not probe:
        return {
            "skipped": True,
            "note": "Could not read activity_logs (MySQL down, wrong DB, or schema not created).",
        }

    students = mysql_table(
        env,
        "SELECT COUNT(*), "
        "IFNULL(SUM(exam_started),0), IFNULL(SUM(exam_submitted),0), "
        "IFNULL(SUM(exam_started=1 AND exam_submitted=0),0), "
        "IFNULL(SUM(exam_started=1 AND exam_submitted=0 "
        "AND last_saved_at >= NOW() - INTERVAL 2 MINUTE),0) "
        "FROM students",
    )
    events = mysql_table(
        env,
        f"SELECT event_type, COUNT(*) FROM activity_logs "
        f"WHERE created_at >= NOW() - INTERVAL {hours} HOUR "
        f"GROUP BY event_type ORDER BY COUNT(*) DESC",
    )
    save_peak = mysql_table(
        env,
        f"SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i'), COUNT(*) "
        f"FROM activity_logs WHERE event_type='ANSWER_SAVED' "
        f"AND created_at >= NOW() - INTERVAL {hours} HOUR "
        f"GROUP BY 1 ORDER BY 2 DESC LIMIT 8",
    )
    concurrent = mysql_table(
        env,
        f"SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(created_at)/30)*30), "
        f"COUNT(DISTINCT student_id) FROM activity_logs "
        f"WHERE event_type='ANSWER_SAVED' "
        f"AND created_at >= NOW() - INTERVAL {hours} HOUR "
        f"GROUP BY 1 ORDER BY 2 DESC LIMIT 8",
    )
    duration = mysql_table(
        env,
        "SELECT COUNT(*), "
        "ROUND(AVG(sec)/60,1), ROUND(MIN(sec)/60,1), ROUND(MAX(sec)/60,1) FROM ("
        "  SELECT TIMESTAMPDIFF(SECOND, s.started_at, MIN(a.created_at)) AS sec "
        "  FROM students s "
        "  JOIN activity_logs a ON a.student_id = s.id "
        "    AND a.event_type IN ('AUTO_SUBMIT','MANUAL_SUBMIT') "
        "  WHERE s.started_at IS NOT NULL "
        "  GROUP BY s.id, s.started_at"
        ") d WHERE sec BETWEEN 0 AND 86400",
    )
    answers = mysql_table(
        env,
        "SELECT COUNT(*), IFNULL(SUM(selected_option IS NOT NULL),0) FROM student_answers",
    )
    tables = mysql_table(
        env,
        "SELECT table_name, table_rows, "
        "ROUND((data_length+index_length)/1024/1024,2) "
        "FROM information_schema.tables "
        f"WHERE table_schema = DATABASE() "
        "AND table_name IN ('activity_logs','student_answers','students','exams','questions') "
        "ORDER BY (data_length+index_length) DESC",
    )
    exams = mysql_table(
        env,
        "SELECT exam_code, start_time, end_time, "
        "IF(NOW() BETWEEN start_time AND end_time,'in_window','outside') "
        "FROM exams ORDER BY start_time DESC LIMIT 10",
    )
    tab_switch = mysql_table(
        env,
        f"SELECT COUNT(*) FROM activity_logs WHERE event_type='TAB_SWITCH' "
        f"AND created_at >= NOW() - INTERVAL {hours} HOUR",
    )

    def first_row(rows: list[list[str]], n: int) -> list[str]:
        if not rows:
            return [""] * n
        row = rows[0] + [""] * n
        return row[:n]

    sc = first_row(students, 5)
    dur = first_row(duration, 4)
    ans = first_row(answers, 2)
    return {
        "skipped": False,
        "hours": hours,
        "students_total": sc[0],
        "exam_started": sc[1],
        "exam_submitted": sc[2],
        "in_progress": sc[3],
        "active_last_2m": sc[4],
        "events": events,
        "save_peak_minutes": save_peak,
        "concurrent_30s": concurrent,
        "duration_n": dur[0],
        "duration_avg_min": dur[1],
        "duration_min_min": dur[2],
        "duration_max_min": dur[3],
        "answer_rows": ans[0],
        "answered_cells": ans[1],
        "tables": tables,
        "exams": exams,
        "tab_switches": first_row(tab_switch, 1)[0] or "0",
    }


def verdict(snapshot: dict[str, Any]) -> dict[str, Any]:
    findings: list[tuple[str, str]] = []
    host = snapshot["host"]
    svc = snapshot["services"]
    log = snapshot["access"]
    probes = snapshot["probes"]

    backend_state = svc["states"].get("ecobrains-lms-backend") or svc["states"].get(
        snapshot["meta"]["service_name"], ""
    )
    if backend_state != "active":
        findings.append(("critical", f"Backend systemd unit is '{backend_state}'."))
    if svc["states"].get("nginx") not in ("active",):
        findings.append(("warn", f"Nginx is '{svc['states'].get('nginx')}'. Frontend may be down."))

    if host["load_per_cpu"] >= 1.5:
        findings.append(("critical", f"Load average {host['load']['1']:.2f} on {host['cpu_count']} CPU(s)."))
    elif host["load_per_cpu"] >= 0.8:
        findings.append(("warn", f"Elevated load {host['load']['1']:.2f} on {host['cpu_count']} CPU(s)."))

    if host["memory_used_pct"] >= 90:
        findings.append(("critical", f"Memory {host['memory_used_pct']}% used."))
    elif host["memory_used_pct"] >= 80:
        findings.append(("warn", f"Memory {host['memory_used_pct']}% used."))

    if host["disk_used_pct"] >= 90:
        findings.append(("critical", f"Root disk {host['disk_used_pct']}% full."))
    elif host["disk_used_pct"] >= 80:
        findings.append(("warn", f"Root disk {host['disk_used_pct']}% full."))

    parsed = log.get("parsed") or 0
    if parsed:
        err5 = log["errors_5xx"]
        gw = log["gateway"]
        if gw:
            findings.append(("critical", f"{gw} gateway errors (502/503/504) in the log window."))
        elif err5 / parsed >= 0.01:
            findings.append(("critical", f"5xx rate {pct(err5, parsed)}."))
        elif err5:
            findings.append(("warn", f"{err5} 5xx responses ({pct(err5, parsed)})."))
        if log["errors_4xx"] / parsed >= 0.15:
            findings.append(("warn", f"High 4xx rate {pct(log['errors_4xx'], parsed)}."))

    api = probes.get("backend_public_api", {})
    if api.get("ok", 0) == 0:
        findings.append(("critical", "Live backend API probe failed."))
    elif (api.get("latency_ms_avg") or 0) >= 800:
        findings.append(("warn", f"Backend API average latency {api['latency_ms_avg']} ms."))

    journal_n = snapshot["journal"].get("error_count") or 0
    if journal_n >= 20:
        findings.append(("warn", f"{journal_n} backend journal error lines in the window (CHDIR/crash loop?)."))

    app = snapshot.get("app") or {}
    if not app.get("skipped"):
        try:
            active = int(app.get("active_last_2m") or 0)
            in_prog = int(app.get("in_progress") or 0)
            peak_row = (app.get("concurrent_30s") or [[None, "0"]])[0]
            peak_users = int(peak_row[1]) if peak_row and len(peak_row) > 1 and str(peak_row[1]).isdigit() else 0
        except (TypeError, ValueError, IndexError):
            active, in_prog, peak_users = 0, 0, 0
        if peak_users >= 200:
            findings.append(("warn", f"Peak concurrent save-progress students (30s): {peak_users}."))
        if in_prog >= 50 and active == 0:
            findings.append(("warn", f"{in_prog} exams marked in-progress but none saved in the last 2 minutes."))
        if active:
            findings.append(("ok", f"{active} students saved answers in the last 2 minutes (live exam load)."))

    if not findings:
        findings.append(("ok", "No critical resource, error-rate, or probe failures in this snapshot."))

    rank = {"ok": 0, "warn": 1, "critical": 2}
    overall = max(findings, key=lambda item: rank[item[0]])[0]
    return {"overall": overall, "findings": findings}


def render_markdown(snapshot: dict[str, Any]) -> str:
    host = snapshot["host"]
    svc = snapshot["services"]
    log = snapshot["access"]
    verd = snapshot["verdict"]
    lines = [
        f"# EcoBrains LMS performance report",
        f"",
        f"- Host: **{host['hostname']}**",
        f"- Generated: {host['time']}",
        f"- Overall: **{verd['overall'].upper()}**",
        f"",
        f"## Findings",
    ]
    for level, msg in verd["findings"]:
        lines.append(f"- `{level}` {msg}")
    lines += [
        "",
        "## Host",
        f"- CPUs: {host['cpu_count']}",
        f"- Load (1/5/15): {host['load']['1']:.2f} / {host['load']['5']:.2f} / {host['load']['15']:.2f} "
        f"(per-CPU 1m: {host['load_per_cpu']})",
        f"- Memory used: {host['memory_used_pct']}% "
        f"({human_bytes(host['memory_total'] - host['memory_available'])} of {human_bytes(host['memory_total'])})",
        f"- Swap used: {human_bytes(host['swap_used'])} of {human_bytes(host['swap_total'])}",
        f"- Disk `/`: {host['disk_used_pct']}% ({human_bytes(host['disk_used'])} of {human_bytes(host['disk_total'])})",
        f"- Uptime: {host['uptime']}",
        "",
        "## Services",
    ]
    for name, state in svc["states"].items():
        lines.append(f"- `{name}`: {state}")
    java = svc.get("java") or {}
    if java:
        lines.append(
            f"- Java PID {java.get('pid')}: RSS {human_bytes(java.get('rss_bytes') or 0)}, "
            f"CPU {java.get('cpu_pct')}%, elapsed {java.get('etime')}"
        )
    lines += ["", "## Live probes"]
    for name, probe in snapshot["probes"].items():
        lines.append(
            f"- **{name}** `{probe['url']}` — {probe['ok']}/{probe['n']} OK, "
            f"avg {probe['latency_ms_avg']} ms, max {probe['latency_ms_max']} ms, codes {probe['codes']}"
        )
    lines += ["", "## Nginx access log"]
    if log.get("skipped"):
        lines.append(f"- {log.get('note')}")
    else:
        lines += [
            f"- File: `{log['path']}` ({log.get('from')} → {log.get('to')})",
            f"- Requests: {log['parsed']}, unique IPs: {log['unique_ips']}",
            f"- Status: {log['status']}",
            f"- 4xx: {log['errors_4xx']} ({pct(log['errors_4xx'], log['parsed'])}), "
            f"5xx: {log['errors_5xx']} ({pct(log['errors_5xx'], log['parsed'])}), "
            f"gateway: {log['gateway']}",
            f"- Peak RPS: {log['peak_rps']} at {log['peak_rps_at']}",
            f"- Peak RPM: {log['peak_rpm']} at {log['peak_rpm_at']}",
            f"- Exam API: {log['exam']}",
            f"- Peak concurrent exam users (30s save-progress IPs): "
            f"{log['concurrent_exam_30s']} at {log['concurrent_at']}",
        ]
        if log.get("latency"):
            lat = log["latency"]
            lines.append(
                f"- Logged request_time: avg {lat['avg_ms']} ms, p95 {lat['p95_ms']} ms, max {lat['max_ms']} ms "
                f"(n={lat['count']})"
            )
        lines.append("- Top paths:")
        for path, count in log["top_paths"]:
            lines.append(f"  - {count} `{path}`")

    mysql = snapshot["mysql"]
    lines += ["", "## MySQL"]
    if mysql.get("skipped"):
        lines.append(f"- {mysql.get('note')}")
    else:
        for key, val in mysql.get("stats", {}).items():
            if key == "innodb_buffer_pool_size" and str(val).isdigit():
                lines.append(f"- {key}: {human_bytes(int(val))}")
            else:
                lines.append(f"- {key}: {val}")

    app = snapshot.get("app") or {}
    lines += ["", "## Application workload (from LMS database)"]
    if app.get("skipped"):
        lines.append(f"- {app.get('note')}")
        lines.append("- The backend has no Actuator/Micrometer timers; this section uses `activity_logs`, `students`, and `student_answers`.")
    else:
        lines += [
            f"- Window: last {app['hours']} hour(s)",
            f"- Students: {app['students_total']} total, started {app['exam_started']}, "
            f"submitted {app['exam_submitted']}, in-progress {app['in_progress']}, "
            f"saved in last 2 min {app['active_last_2m']}",
            f"- Tab-switch events: {app['tab_switches']}",
            f"- Exam duration (start → first submit): n={app['duration_n']}, "
            f"avg {app['duration_avg_min']} min, min {app['duration_min_min']}, max {app['duration_max_min']}",
            f"- student_answers rows: {app['answer_rows']} (cells with a selection: {app['answered_cells']})",
            "- Activity events:",
        ]
        for row in app.get("events") or []:
            if len(row) >= 2:
                lines.append(f"  - {row[0]}: {row[1]}")
        lines.append("- Peak ANSWER_SAVED per minute:")
        for row in (app.get("save_peak_minutes") or [])[:5]:
            if len(row) >= 2:
                lines.append(f"  - {row[0]}: {row[1]}")
        lines.append("- Peak distinct students saving in 30s:")
        for row in (app.get("concurrent_30s") or [])[:5]:
            if len(row) >= 2:
                lines.append(f"  - {row[0]}: {row[1]} students")
        lines.append("- Table sizes:")
        for row in app.get("tables") or []:
            if len(row) >= 3:
                lines.append(f"  - `{row[0]}`: ~{row[1]} rows, {row[2]} MiB")
        lines.append("- Recent exams:")
        for row in app.get("exams") or []:
            lines.append(f"  - {' | '.join(row)}")

    lines += ["", "## Backend journal (errors)", "```"]
    lines.extend(snapshot["journal"].get("error_lines") or ["(none)"])
    lines += ["```", "", "## Nginx error log (tail)", "```"]
    lines.extend(snapshot.get("nginx_errors") or ["(none)"])
    lines += ["```", ""]
    return "\n".join(lines) + "\n"


def _table(headers: list[str], rows: list[list[str]]) -> str:
    head = "".join(f"<th>{escape(h)}</th>" for h in headers)
    body = []
    for row in rows:
        body.append("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def render_html(snapshot: dict[str, Any]) -> str:
    host = snapshot["host"]
    verd = snapshot["verdict"]
    badge = {"ok": "#2f855a", "warn": "#c05621", "critical": "#c53030"}[verd["overall"]]
    findings_html = "".join(
        f"<li><span class='tag {escape(level)}'>{escape(level)}</span> {escape(msg)}</li>"
        for level, msg in verd["findings"]
    )
    svc_rows = [[escape(n), escape(s)] for n, s in snapshot["services"]["states"].items()]
    probe_rows = []
    for name, probe in snapshot["probes"].items():
        probe_rows.append(
            [
                escape(name),
                escape(probe["url"]),
                f"{probe['ok']}/{probe['n']}",
                escape(str(probe["latency_ms_avg"])),
                escape(str(probe["latency_ms_max"])),
                escape(json.dumps(probe["codes"])),
            ]
        )
    log = snapshot["access"]
    log_rows = []
    if not log.get("skipped"):
        log_rows = [
            ["Requests", str(log["parsed"])],
            ["Unique IPs", str(log["unique_ips"])],
            ["Window", f"{log.get('from', '')} → {log.get('to', '')}"],
            ["4xx / 5xx / gateway", f"{log['errors_4xx']} / {log['errors_5xx']} / {log['gateway']}"],
            ["Peak RPS", f"{log['peak_rps']} at {log['peak_rps_at']}"],
            ["Peak RPM", f"{log['peak_rpm']} at {log['peak_rpm_at']}"],
            ["Exam API reqs", str(log["exam"].get("requests"))],
            ["save-progress", str(log["exam"].get("save_progress"))],
            ["Peak concurrent (30s)", f"{log['concurrent_exam_30s']} at {log['concurrent_at']}"],
        ]
    path_rows = [[str(c), escape(p)] for p, c in log.get("top_paths") or []]
    mysql_rows = []
    if snapshot["mysql"].get("skipped"):
        mysql_rows = [["Note", escape(str(snapshot["mysql"].get("note")))]]
    else:
        for key, val in snapshot["mysql"].get("stats", {}).items():
            display = human_bytes(int(val)) if key == "innodb_buffer_pool_size" and str(val).isdigit() else val
            mysql_rows.append([escape(key), escape(str(display))])
    java = snapshot["services"].get("java") or {}
    java_html = "n/a"
    if java:
        java_html = (
            f"PID {escape(str(java.get('pid')))}, RSS {escape(human_bytes(java.get('rss_bytes') or 0))}, "
            f"CPU {escape(str(java.get('cpu_pct')))}%, elapsed {escape(str(java.get('etime')))}"
        )
    journal = escape("\n".join(snapshot["journal"].get("error_lines") or ["(none)"]))
    ngxerr = escape("\n".join(snapshot.get("nginx_errors") or ["(none)"]))
    app = snapshot.get("app") or {}
    if app.get("skipped"):
        app_metric_rows = [["Note", escape(str(app.get("note") or "unavailable"))]]
        app_event_rows = [["—", "—"]]
        app_save_rows = [["—", "—"]]
        app_conc_rows = [["—", "—"]]
        app_table_rows = [["—", "—", "—"]]
        app_exam_rows = [["—", "—", "—", "—"]]
    else:
        app_metric_rows = [
            ["Students", escape(str(app.get("students_total")))],
            ["Exam started / submitted / in-progress", f"{escape(str(app.get('exam_started')))} / {escape(str(app.get('exam_submitted')))} / {escape(str(app.get('in_progress')))}"],
            ["Saved in last 2 min", escape(str(app.get("active_last_2m")))],
            ["Tab switches (window)", escape(str(app.get("tab_switches")))],
            ["Exam duration avg/min/max (min)", f"{escape(str(app.get('duration_avg_min')))} / {escape(str(app.get('duration_min_min')))} / {escape(str(app.get('duration_max_min')))} (n={escape(str(app.get('duration_n')))})"],
            ["student_answers (selected)", f"{escape(str(app.get('answer_rows')))} ({escape(str(app.get('answered_cells')))} filled)"],
        ]
        app_event_rows = [[escape(r[0]), escape(r[1])] for r in (app.get("events") or []) if len(r) >= 2] or [["—", "—"]]
        app_save_rows = [[escape(r[0]), escape(r[1])] for r in (app.get("save_peak_minutes") or [])[:8] if len(r) >= 2] or [["—", "—"]]
        app_conc_rows = [[escape(r[0]), escape(r[1])] for r in (app.get("concurrent_30s") or [])[:8] if len(r) >= 2] or [["—", "—"]]
        app_table_rows = [
            [escape(r[0]), escape(r[1]), escape(r[2])]
            for r in (app.get("tables") or [])
            if len(r) >= 3
        ] or [["—", "—", "—"]]
        app_exam_rows = [[escape(c) for c in r[:4]] for r in (app.get("exams") or [])] or [["—", "—", "—", "—"]]
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>EcoBrains LMS performance — {escape(host['hostname'])}</title>
<style>
body {{ font-family: Georgia, serif; margin: 32px auto; max-width: 960px; color: #1a202c; }}
h1,h2 {{ color: #1e3a5f; }}
.badge {{ display:inline-block; padding:6px 12px; color:#fff; background:{badge}; border-radius:4px; }}
.tag {{ display:inline-block; min-width:72px; padding:2px 8px; color:#fff; border-radius:3px; font-size:12px; }}
.tag.ok {{ background:#2f855a; }} .tag.warn {{ background:#c05621; }} .tag.critical {{ background:#c53030; }}
table {{ border-collapse: collapse; width: 100%; margin: 12px 0 24px; font-size: 14px; }}
th {{ background:#1e3a5f; color:#fff; text-align:left; padding:8px; }}
td {{ border:1px solid #cbd5e0; padding:8px; }}
tr:nth-child(even) td {{ background:#f5f7fa; }}
pre {{ background:#f0f4f8; padding:12px; overflow:auto; font-size:12px; }}
.meta {{ color:#4a5568; }}
</style></head><body>
<h1>EcoBrains LMS performance report</h1>
<p class="meta">{escape(host['hostname'])} · {escape(host['time'])} · {escape(host['uptime'])}</p>
<p><span class="badge">{escape(verd['overall'].upper())}</span></p>
<h2>Findings</h2>
<ul>{findings_html}</ul>
<h2>Host</h2>
{_table(
    ["Metric", "Value"],
    [
        ["CPUs", str(host["cpu_count"])],
        ["Load 1/5/15", f"{host['load']['1']:.2f} / {host['load']['5']:.2f} / {host['load']['15']:.2f}"],
        ["Memory used", f"{host['memory_used_pct']}% ({human_bytes(host['memory_total'] - host['memory_available'])} / {human_bytes(host['memory_total'])})"],
        ["Swap used", f"{human_bytes(host['swap_used'])} / {human_bytes(host['swap_total'])}"],
        ["Disk /", f"{host['disk_used_pct']}% ({human_bytes(host['disk_used'])} / {human_bytes(host['disk_total'])})"],
        ["Java process", java_html],
    ],
)}
<h2>Services</h2>
{_table(["Unit", "State"], svc_rows)}
<h2>Live probes</h2>
{_table(["Name", "URL", "OK", "Avg ms", "Max ms", "Codes"], probe_rows)}
<h2>Nginx access log</h2>
{_table(["Metric", "Value"], [[escape(a), escape(b)] for a, b in log_rows] if log_rows else [["Note", escape(str(log.get("note") or "no data"))]])}
<h2>Top paths</h2>
{_table(["Count", "Path"], path_rows if path_rows else [["—", "none"]])}
<h2>MySQL</h2>
{_table(["Variable", "Value"], mysql_rows if mysql_rows else [["—", "none"]])}
<h2>Application workload (LMS database)</h2>
<p class="meta">From <code>activity_logs</code>, <code>students</code>, <code>student_answers</code> — not HTTP timers (no Actuator in this build).</p>
{_table(["Metric", "Value"], app_metric_rows)}
{_table(["Event", "Count"], app_event_rows)}
{_table(["Minute", "ANSWER_SAVED"], app_save_rows)}
{_table(["30s bucket", "Distinct students"], app_conc_rows)}
{_table(["Table", "Rows", "MiB"], app_table_rows)}
{_table(["Exam code", "Start", "End", "Window"], app_exam_rows)}
<h2>Backend journal errors</h2>
<pre>{journal}</pre>
<h2>Nginx error log (tail)</h2>
<pre>{ngxerr}</pre>
</body></html>
"""


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    project = script_dir.parent
    parser = argparse.ArgumentParser(description="EcoBrains LMS VPS performance report")
    parser.add_argument("--project-root", default=str(project))
    parser.add_argument("--out-dir", default="")
    parser.add_argument("--access-log", default="/var/log/nginx/access.log")
    parser.add_argument("--error-log", default="/var/log/nginx/error.log")
    parser.add_argument("--max-lines", type=int, default=250000)
    parser.add_argument("--hours", type=int, default=24, help="journal + access-log time window")
    parser.add_argument("--probes", type=int, default=8, help="live curl samples per URL")
    parser.add_argument("--no-mysql", action="store_true")
    parser.add_argument("--json", action="store_true", help="also write snapshot.json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project = Path(args.project_root).resolve()
    env = load_env_file(project / ".env")
    service = os.environ.get("SERVICE_NAME", "ecobrains-lms-backend")
    port = int(env.get("BACKEND_PORT") or os.environ.get("BACKEND_PORT") or "8080")
    out_dir = Path(args.out_dir) if args.out_dir else project / "docs" / "perf-reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    since = datetime.now() - timedelta(hours=args.hours)

    snapshot: dict[str, Any] = {
        "meta": {
            "service_name": service,
            "backend_port": port,
            "project_root": str(project),
            "hours": args.hours,
        },
        "host": collect_host(),
        "services": collect_services(service),
        "probes": collect_probes(port, max(1, args.probes)),
        "access": analyze_access_log(Path(args.access_log), args.max_lines, since),
        "nginx_errors": collect_nginx_errors(Path(args.error_log)),
        "journal": collect_journal(service, args.hours),
        "mysql": {"skipped": True, "note": "disabled"} if args.no_mysql else collect_mysql(env),
        "app": {"skipped": True, "note": "disabled"} if args.no_mysql else collect_app(env, args.hours),
    }
    snapshot["verdict"] = verdict(snapshot)

    md_path = out_dir / f"perf-{stamp}.md"
    html_path = out_dir / f"perf-{stamp}.html"
    md_path.write_text(render_markdown(snapshot), encoding="utf-8")
    html_path.write_text(render_html(snapshot), encoding="utf-8")
    latest_md = out_dir / "latest.md"
    latest_html = out_dir / "latest.html"
    latest_md.write_text(md_path.read_text(encoding="utf-8"), encoding="utf-8")
    latest_html.write_text(html_path.read_text(encoding="utf-8"), encoding="utf-8")
    if args.json:
        serial = json.loads(json.dumps(snapshot, default=str))
        (out_dir / f"perf-{stamp}.json").write_text(json.dumps(serial, indent=2), encoding="utf-8")

    print(f"[INFO]  Overall: {snapshot['verdict']['overall'].upper()}")
    for level, msg in snapshot["verdict"]["findings"]:
        print(f"  [{level}] {msg}")
    print(f"[INFO]  Markdown: {md_path}")
    print(f"[INFO]  HTML:     {html_path}")
    print(f"[INFO]  Latest:   {latest_html}")
    return 0 if snapshot["verdict"]["overall"] != "critical" else 2


if __name__ == "__main__":
    raise SystemExit(main())
