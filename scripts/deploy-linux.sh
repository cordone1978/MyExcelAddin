#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-quotationaddin}"
APP_HOST="${APP_HOST:-192.168.1.79}"
APP_PORT="${APP_PORT:-3001}"
APP_BASE_URL="${APP_BASE_URL:-https://${APP_HOST}:${APP_PORT}}"
DB_PROFILE="${DB_PROFILE:-company}"
CERT_BASE_DIR="${CERT_BASE_DIR:-}"
WORKDIR="${WORKDIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_DIR="${LOG_DIR:-${WORKDIR}/logs}"
PID_FILE="${PID_FILE:-${LOG_DIR}/${APP_NAME}.pid}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"

BACKUP_DIR="${WORKDIR}/.deploy-backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  deploy    Replace production config, install deps, build, and restart service
  start     Start server (pm2 preferred, fallback nohup)
  stop      Stop server
  restart   Restart server
  status    Show server status
  patch     Only patch manifest.xml for production URLs
  build     Only install deps and build

Environment variables:
  APP_NAME      Default: ${APP_NAME}
  APP_HOST      Default: ${APP_HOST}
  APP_PORT      Default: ${APP_PORT}
  APP_BASE_URL  Default: ${APP_BASE_URL}
  DB_PROFILE    Default: ${DB_PROFILE}  (passed to server via env)
  CERT_BASE_DIR Default: ${CERT_BASE_DIR:-<unset>} (external SSL cert directory; optional)
  WORKDIR       Default: repo root
  LOG_DIR       Default: ${LOG_DIR}
  NODE_BIN      Default: ${NODE_BIN}
  NPM_BIN       Default: ${NPM_BIN}
EOF
}

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

ensure_dirs() {
  mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"
}

require_tools() {
  command -v "${NODE_BIN}" >/dev/null 2>&1 || { echo "Missing node: ${NODE_BIN}" >&2; exit 1; }
  command -v "${NPM_BIN}" >/dev/null 2>&1 || { echo "Missing npm: ${NPM_BIN}" >&2; exit 1; }
}

require_node() {
  command -v "${NODE_BIN}" >/dev/null 2>&1 || { echo "Missing node: ${NODE_BIN}" >&2; exit 1; }
}

require_python3() {
  command -v python3 >/dev/null 2>&1 || {
    echo "Missing python3 (required by patch command). Install with: yum -y install python3 / apt-get install -y python3" >&2
    exit 1
  }
}

backup_file() {
  local file="$1"
  local dst="${BACKUP_DIR}/$(basename "$file").${TIMESTAMP}.bak"
  cp -f "${WORKDIR}/${file}" "${dst}"
  log "Backup created: ${dst}"
}

replace_exact() {
  local file="$1"
  local search="$2"
  local replace="$3"
  python3 - "$WORKDIR/$file" "$search" "$replace" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
search = sys.argv[2]
replace = sys.argv[3]
text = path.read_text(encoding="utf-8")
if search not in text:
    print(f"[WARN] pattern not found in {path}: {search}")
else:
    text = text.replace(search, replace)
    path.write_text(text, encoding="utf-8")
    print(f"[OK] patched {path}")
PY
}

replace_regex() {
  local file="$1"
  local pattern="$2"
  local repl="$3"
  python3 - "$WORKDIR/$file" "$pattern" "$repl" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
pattern = sys.argv[2]
repl = sys.argv[3]
text = path.read_text(encoding="utf-8")
new_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
if count == 0:
    print(f"[WARN] regex not matched in {path}: {pattern}")
else:
    path.write_text(new_text, encoding="utf-8")
    print(f"[OK] regex patched {path}")
PY
}

replace_regex_all() {
  local file="$1"
  local pattern="$2"
  local repl="$3"
  python3 - "$WORKDIR/$file" "$pattern" "$repl" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
pattern = sys.argv[2]
repl = sys.argv[3]
text = path.read_text(encoding="utf-8")
new_text, count = re.subn(pattern, repl, text, flags=re.S)
if count == 0:
    print(f"[WARN] regex not matched in {path}: {pattern}")
else:
    path.write_text(new_text, encoding="utf-8")
    print(f"[OK] regex patched {path} (count={count})")
PY
}

patch_config_files() {
  ensure_dirs
  cd "${WORKDIR}"
  require_node
  log "Rendering manifest.xml for target environment..."

  backup_file "manifest.xml"

  MANIFEST_BASE_URL="${APP_BASE_URL}" "${NODE_BIN}" "${WORKDIR}/scripts/render-manifest.js"

  log "Manifest render complete. Runtime server config comes from env (APP_HOST/APP_PORT/DB_PROFILE/CERT_BASE_DIR)."
}

install_and_build() {
  cd "${WORKDIR}"
  require_tools
  log "Installing dependencies..."
  if [[ -f package-lock.json ]]; then
    if ! "${NPM_BIN}" ci; then
      log "npm ci failed, falling back to npm install (lock file may be out of sync)"
      "${NPM_BIN}" install
    fi
  else
    "${NPM_BIN}" install
  fi
  log "Building frontend..."
  "${NPM_BIN}" run build
}

pm2_available() {
  command -v pm2 >/dev/null 2>&1
}

start_with_pm2() {
  cd "${WORKDIR}"
  if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
    log "Restarting PM2 app: ${APP_NAME}"
    CERT_BASE_DIR="${CERT_BASE_DIR}" pm2 restart "${APP_NAME}" --update-env
  else
    log "Starting PM2 app: ${APP_NAME}"
    CERT_BASE_DIR="${CERT_BASE_DIR}" pm2 start server.js --name "${APP_NAME}"
  fi
  pm2 save || true
}

start_with_nohup() {
  cd "${WORKDIR}"
  ensure_dirs
  stop_with_nohup || true
  log "Starting with nohup..."
  CERT_BASE_DIR="${CERT_BASE_DIR}" nohup "${NODE_BIN}" server.js > "${LOG_DIR}/${APP_NAME}.out" 2>&1 &
  echo $! > "${PID_FILE}"
  sleep 1
  if kill -0 "$(cat "${PID_FILE}")" >/dev/null 2>&1; then
    log "Started (pid=$(cat "${PID_FILE}")), log=${LOG_DIR}/${APP_NAME}.out"
  else
    log "Start failed. Check log: ${LOG_DIR}/${APP_NAME}.out"
    exit 1
  fi
}

start_service() {
  if pm2_available; then
    start_with_pm2
  else
    start_with_nohup
  fi
}

stop_with_nohup() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
    log "Stopping pid ${pid}"
    kill "${pid}" || true
    sleep 1
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill -9 "${pid}" || true
    fi
  fi
  rm -f "${PID_FILE}"
}

stop_service() {
  if pm2_available && pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
    log "Stopping PM2 app: ${APP_NAME}"
    pm2 stop "${APP_NAME}" || true
  else
    stop_with_nohup
  fi
}

status_service() {
  if pm2_available && pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
    pm2 status "${APP_NAME}"
    return 0
  fi

  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      log "RUNNING (nohup) pid=${pid}"
      return 0
    fi
  fi
  log "STOPPED"
}

restart_service() {
  stop_service || true
  start_service
}

deploy_all() {
  patch_config_files
  install_and_build
  restart_service
  log "Deploy completed."
  log "Health check: curl -k ${APP_BASE_URL}/api/test"
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    deploy)
      deploy_all
      ;;
    patch)
      patch_config_files
      ;;
    build)
      install_and_build
      ;;
    start)
      start_service
      ;;
    stop)
      stop_service
      ;;
    restart)
      restart_service
      ;;
    status)
      status_service
      ;;
    -h|--help|help|"")
      usage
      ;;
    *)
      echo "Unknown command: ${cmd}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
