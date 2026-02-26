#!/usr/bin/env bash
set -euo pipefail

# Single-script server updater:
# - optional package extraction (tgz)
# - patch/build/restart
# - best-effort manifest sync to Samba shared folder
# - local health check

APP_HOST="${APP_HOST:-quotation.company}"
APP_PORT="${APP_PORT:-3001}"
DB_PROFILE="${DB_PROFILE:-company}"
CERT_BASE_DIR="${CERT_BASE_DIR:-}"
WORKDIR="${WORKDIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_SCRIPT="${WORKDIR}/scripts/deploy-linux.sh"
SHARE_MANIFEST_PATH="${SHARE_MANIFEST_PATH:-/srv/office-addins/manifest.xml}"
SKIP_PUPPETEER_DOWNLOAD="${SKIP_PUPPETEER_DOWNLOAD:-1}"
BACKUP_ROOT="${WORKDIR}/.release-backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

usage() {
  cat <<EOF
Usage: $0 [package.tgz] [--no-patch] [--no-build] [--no-restart] [--no-share-sync] [--keep-package] [--dry-run]

Examples:
  # Update current code in place
  ./scripts/update-server.sh

  # Update from uploaded package, then patch/build/restart
  ./scripts/update-server.sh ~/upload/quotationaddin-deploy.tgz

  # Update from package but skip build (not common)
  ./scripts/update-server.sh ~/upload/quotationaddin-deploy.tgz --no-build

Environment variables:
  APP_HOST                Default: ${APP_HOST}
  APP_PORT                Default: ${APP_PORT}
  DB_PROFILE              Default: ${DB_PROFILE}
  CERT_BASE_DIR           Default: ${CERT_BASE_DIR:-<unset>} (external SSL cert directory; optional)
  WORKDIR                 Default: repo root inferred from script location
  SHARE_MANIFEST_PATH     Default: ${SHARE_MANIFEST_PATH}
  SKIP_PUPPETEER_DOWNLOAD Default: ${SKIP_PUPPETEER_DOWNLOAD} (1=export PUPPETEER_SKIP_DOWNLOAD=1)
EOF
}

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
warn() { printf '[%s] [WARN] %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { printf '[%s] [ERR] %s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

NO_PATCH=0
NO_BUILD=0
NO_RESTART=0
NO_SHARE_SYNC=0
KEEP_PACKAGE=0
DRY_RUN=0
PACKAGE=""

for arg in "$@"; do
  case "$arg" in
    --no-patch) NO_PATCH=1 ;;
    --no-build) NO_BUILD=1 ;;
    --no-restart) NO_RESTART=1 ;;
    --no-share-sync) NO_SHARE_SYNC=1 ;;
    --keep-package) KEEP_PACKAGE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help|help) usage; exit 0 ;;
    -*)
      die "Unknown argument: $arg"
      ;;
    *)
      if [[ -z "${PACKAGE}" ]]; then
        PACKAGE="$arg"
      else
        die "Unexpected extra argument: $arg"
      fi
      ;;
  esac
done

[[ -f "${DEPLOY_SCRIPT}" ]] || die "Missing deploy script: ${DEPLOY_SCRIPT}"
cd "${WORKDIR}"

extract_package_if_needed() {
  [[ -n "${PACKAGE}" ]] || return 0
  [[ -f "${PACKAGE}" ]] || die "Package not found: ${PACKAGE}"

  mkdir -p "${BACKUP_ROOT}"
  local backup_file="${BACKUP_ROOT}/quotationaddin-src.${TIMESTAMP}.tgz"

  log "Package mode enabled: ${PACKAGE}"
  log "Creating source backup (excluding node_modules/dist/logs)..."
  tar -czf "${backup_file}" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='logs' \
    --exclude='.deploy-backups' \
    --exclude='.release-backups' \
    -C "${WORKDIR}" .
  log "Backup created: ${backup_file}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "Dry run enabled; skip extraction"
    return 0
  fi

  log "Extracting package into WORKDIR..."
  tar -xzf "${PACKAGE}" -C "${WORKDIR}"

  if [[ "${KEEP_PACKAGE}" != "1" ]]; then
    rm -f "${PACKAGE}" || true
  fi
}

run_update_steps() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "Dry run enabled; skip patch/build/restart/share-sync/health-check"
    return 0
  fi

  if [[ "${SKIP_PUPPETEER_DOWNLOAD}" == "1" ]]; then
    export PUPPETEER_SKIP_DOWNLOAD=1
    log "PUPPETEER_SKIP_DOWNLOAD=1 (enabled)"
  fi

  if [[ "${NO_PATCH}" != "1" ]]; then
    log "Step 1/4: patch production config"
    APP_HOST="${APP_HOST}" APP_PORT="${APP_PORT}" DB_PROFILE="${DB_PROFILE}" CERT_BASE_DIR="${CERT_BASE_DIR}" "${DEPLOY_SCRIPT}" patch
  else
    log "Step 1/4: patch skipped (--no-patch)"
  fi

  if [[ "${NO_BUILD}" != "1" ]]; then
    log "Step 2/4: install/build"
    APP_HOST="${APP_HOST}" APP_PORT="${APP_PORT}" DB_PROFILE="${DB_PROFILE}" CERT_BASE_DIR="${CERT_BASE_DIR}" "${DEPLOY_SCRIPT}" build
  else
    log "Step 2/4: build skipped (--no-build)"
  fi

  if [[ "${NO_RESTART}" != "1" ]]; then
    log "Step 3/4: restart service"
    APP_HOST="${APP_HOST}" APP_PORT="${APP_PORT}" DB_PROFILE="${DB_PROFILE}" CERT_BASE_DIR="${CERT_BASE_DIR}" "${DEPLOY_SCRIPT}" restart
    "${DEPLOY_SCRIPT}" status || true
  else
    log "Step 3/4: restart skipped (--no-restart)"
  fi

  if [[ "${NO_SHARE_SYNC}" != "1" ]]; then
    log "Step 4/4: sync manifest to shared folder (best effort)"
    if [[ -f "${WORKDIR}/manifest.xml" ]]; then
      if cp -f "${WORKDIR}/manifest.xml" "${SHARE_MANIFEST_PATH}" 2>/dev/null; then
        log "manifest synced -> ${SHARE_MANIFEST_PATH}"
      else
        warn "manifest sync skipped/failed (permission?) path=${SHARE_MANIFEST_PATH}"
      fi
    else
      warn "manifest.xml not found in WORKDIR"
    fi
  else
    log "Step 4/4: share sync skipped (--no-share-sync)"
  fi

  log "Health check (localhost)"
  if command -v curl >/dev/null 2>&1; then
    if curl -ksS "https://127.0.0.1:${APP_PORT}/api/test"; then
      printf '\n'
      log "Health check passed"
    else
      warn "Health check failed: https://127.0.0.1:${APP_PORT}/api/test"
    fi
  else
    warn "curl not found; skip health check"
  fi
}

log "One-click server update started"
log "WORKDIR=${WORKDIR}"
log "APP_HOST=${APP_HOST}, APP_PORT=${APP_PORT}, DB_PROFILE=${DB_PROFILE}"
log "CERT_BASE_DIR=${CERT_BASE_DIR:-<unset>}"

extract_package_if_needed
run_update_steps

log "One-click server update completed"
