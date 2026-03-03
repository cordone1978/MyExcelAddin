#!/usr/bin/env bash
set -euo pipefail

log() { printf '[bootstrap][%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { printf '[bootstrap][%s] [ERR] %s\n' "$(date '+%F %T')" "$*" >&2; exit 1; }

WORKDIR="${1:-}"
PACKAGE="${2:-}"
shift $(( $# >= 2 ? 2 : $# ))

[[ -n "${WORKDIR}" ]] || die "missing WORKDIR argument"
[[ -n "${PACKAGE}" ]] || die "missing PACKAGE argument"
[[ -f "${PACKAGE}" ]] || die "package not found: ${PACKAGE}"

KEEP_PACKAGE=0
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --keep-package) KEEP_PACKAGE=1 ;;
    --no-build) NO_BUILD=1 ;;
  esac
done

mkdir -p "${WORKDIR}"

# Avoid stale files after tar extraction (tar overwrites but does not delete removed files).
if [[ -d "${WORKDIR}/assets" ]]; then
  log "Removing stale assets dir: ${WORKDIR}/assets"
  rm -rf "${WORKDIR}/assets"
fi
if [[ "${NO_BUILD}" != "1" && -d "${WORKDIR}/dist" ]]; then
  log "Removing stale dist dir: ${WORKDIR}/dist"
  rm -rf "${WORKDIR}/dist"
fi

log "Extracting package into ${WORKDIR}"
tar -xzf "${PACKAGE}" -C "${WORKDIR}"

if [[ -d "${WORKDIR}/scripts" ]]; then
  chmod +x "${WORKDIR}"/scripts/*.sh 2>/dev/null || true
fi

if [[ "${KEEP_PACKAGE}" != "1" ]]; then
  rm -f "${PACKAGE}" || true
fi

cd "${WORKDIR}"
[[ -f "./scripts/update-server.sh" ]] || die "missing update script: ${WORKDIR}/scripts/update-server.sh"

log "Handing off to repo update script"
exec bash ./scripts/update-server.sh "$@"
