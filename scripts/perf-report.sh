#!/usr/bin/env bash
# EcoBrains LMS — collect VPS performance metrics and write HTML/Markdown reports.
#
# Usage:
#   sudo ./scripts/perf-report.sh
#   sudo ./scripts/perf-report.sh --hours 6 --probes 10
#   python3 scripts/perf-report.py --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERROR] python3 is required. Install: sudo apt-get install -y python3" >&2
  exit 1
fi

exec python3 "${SCRIPT_DIR}/perf-report.py" "$@"
