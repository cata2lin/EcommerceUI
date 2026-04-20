#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# autodeploy.sh — Intelligent Auto-Deploy for E-Commerce BI Platform
# ═══════════════════════════════════════════════════════════════════════
# Features:
#   • Lock file prevents concurrent deployments
#   • Dependency change detection (only reinstalls when hashes change)
#   • Frontend build (always — fast with Vite)
#   • Systemd service restart
#   • Health check with rollback on failure
#   • Full timestamped logging
#
# Usage: Called by webhook_listener.py, or manually:
#   sudo /opt/ecommerce/deploy/autodeploy.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration (edit these) ──────────────────────────────────────
PROJECT_DIR="/opt/ecommerce"
VENV_DIR="${PROJECT_DIR}/.venv"
FRONTEND_DIR="${PROJECT_DIR}/frontend"
FRONTEND_DIST="${PROJECT_DIR}/api/frontend_dist"
LOG_FILE="/var/log/ecommerce-deploy.log"
LOCK_FILE="/tmp/ecommerce-deploy.lock"
HASH_DIR="/var/lib/ecommerce-deploy"
SERVICE_NAME="ecommerce-api"
HEALTH_URL="http://localhost:8000/api/health"
HEALTH_TIMEOUT=30
GIT_BRANCH="main"

# ─── Logging ─────────────────────────────────────────────────────────
log() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] $1" | tee -a "${LOG_FILE}"
}

log_error() {
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ❌ ERROR: $1" | tee -a "${LOG_FILE}" >&2
}

log_success() {
    log "✅ $1"
}

# ─── Lock Management ────────────────────────────────────────────────
acquire_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        local lock_pid
        lock_pid=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
        if [ -n "${lock_pid}" ] && kill -0 "${lock_pid}" 2>/dev/null; then
            log_error "Deploy already in progress (PID: ${lock_pid}). Aborting."
            exit 1
        else
            log "Stale lock file found (PID: ${lock_pid}). Removing."
            rm -f "${LOCK_FILE}"
        fi
    fi
    echo $$ > "${LOCK_FILE}"
    log "Lock acquired (PID: $$)"
}

release_lock() {
    rm -f "${LOCK_FILE}"
    log "Lock released."
}

# Ensure lock is released on exit (success or failure)
trap release_lock EXIT

# ─── Hash Helpers (dependency change detection) ──────────────────────
ensure_hash_dir() {
    mkdir -p "${HASH_DIR}"
}

get_stored_hash() {
    local name="$1"
    cat "${HASH_DIR}/${name}.hash" 2>/dev/null || echo ""
}

store_hash() {
    local name="$1" hash="$2"
    echo "${hash}" > "${HASH_DIR}/${name}.hash"
}

file_hash() {
    sha256sum "$1" 2>/dev/null | awk '{print $1}'
}

# ─── Health Check ────────────────────────────────────────────────────
check_health() {
    local elapsed=0
    while [ ${elapsed} -lt ${HEALTH_TIMEOUT} ]; do
        if curl -sf "${HEALTH_URL}" > /dev/null 2>&1; then
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    return 1
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN DEPLOY SEQUENCE
# ═══════════════════════════════════════════════════════════════════════
main() {
    log "═══════════════════════════════════════════════════════════"
    log "🚀 DEPLOY STARTED"
    log "═══════════════════════════════════════════════════════════"

    acquire_lock
    ensure_hash_dir
    cd "${PROJECT_DIR}"

    # ── Step 1: Save rollback point ──────────────────────────────
    local prev_commit
    prev_commit=$(git rev-parse HEAD 2>/dev/null || echo "none")
    log "Current commit: ${prev_commit}"

    # Backup frontend dist for rollback
    if [ -d "${FRONTEND_DIST}" ]; then
        rm -rf "${FRONTEND_DIST}.bak"
        cp -r "${FRONTEND_DIST}" "${FRONTEND_DIST}.bak"
        log "Frontend dist backed up for rollback."
    fi

    # ── Step 2: Pull latest code ─────────────────────────────────
    log "[1/5] Pulling latest code from ${GIT_BRANCH}..."
    git fetch origin "${GIT_BRANCH}"
    git reset --hard "origin/${GIT_BRANCH}"
    local new_commit
    new_commit=$(git rev-parse HEAD)
    log "Updated to commit: ${new_commit}"

    if [ "${prev_commit}" = "${new_commit}" ]; then
        log "No new commits. Skipping build."
        log_success "DEPLOY COMPLETE (no changes)"
        return 0
    fi

    # ── Step 3: Python dependencies ──────────────────────────────
    local req_hash_old req_hash_new
    req_hash_old=$(get_stored_hash "requirements")
    req_hash_new=$(file_hash "${PROJECT_DIR}/requirements.txt")

    if [ "${req_hash_old}" != "${req_hash_new}" ]; then
        log "[2/5] requirements.txt changed — installing Python dependencies..."
        "${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/requirements.txt" -q 2>&1 | tail -5 | tee -a "${LOG_FILE}"
        store_hash "requirements" "${req_hash_new}"
        log_success "Python dependencies updated."
    else
        log "[2/5] requirements.txt unchanged — skipping pip install."
    fi

    # ── Step 4: Node dependencies ────────────────────────────────
    local pkg_hash_old pkg_hash_new
    pkg_hash_old=$(get_stored_hash "package")
    pkg_hash_new=$(file_hash "${FRONTEND_DIR}/package.json")

    if [ "${pkg_hash_old}" != "${pkg_hash_new}" ]; then
        log "[3/5] package.json changed — installing Node dependencies..."
        cd "${FRONTEND_DIR}"
        npm install --silent 2>&1 | tail -5 | tee -a "${LOG_FILE}"
        cd "${PROJECT_DIR}"
        store_hash "package" "${pkg_hash_new}"
        log_success "Node dependencies updated."
    else
        log "[3/5] package.json unchanged — skipping npm install."
    fi

    # ── Step 5: Build frontend ───────────────────────────────────
    log "[4/5] Building frontend..."
    cd "${FRONTEND_DIR}"
    npm run build 2>&1 | tail -10 | tee -a "${LOG_FILE}"
    cd "${PROJECT_DIR}"
    log_success "Frontend built to ${FRONTEND_DIST}"

    # ── Step 6: Restart service ──────────────────────────────────
    log "[5/5] Restarting ${SERVICE_NAME}..."
    systemctl restart "${SERVICE_NAME}"

    # ── Step 7: Health check ─────────────────────────────────────
    log "Waiting for health check (${HEALTH_TIMEOUT}s timeout)..."
    if check_health; then
        log_success "Health check passed!"
        log "═══════════════════════════════════════════════════════════"
        log_success "DEPLOY COMPLETE — ${prev_commit:0:8} → ${new_commit:0:8}"
        log "═══════════════════════════════════════════════════════════"
    else
        log_error "Health check FAILED after ${HEALTH_TIMEOUT}s!"
        log "🔄 ROLLING BACK..."

        # Restore frontend dist
        if [ -d "${FRONTEND_DIST}.bak" ]; then
            rm -rf "${FRONTEND_DIST}"
            mv "${FRONTEND_DIST}.bak" "${FRONTEND_DIST}"
            log "Frontend dist restored from backup."
        fi

        # Revert git
        git reset --hard "${prev_commit}"
        log "Git reverted to ${prev_commit}"

        # Restart with old code
        systemctl restart "${SERVICE_NAME}"
        sleep 5

        if check_health; then
            log "Rollback service is healthy."
        else
            log_error "Rollback service ALSO failed! Manual intervention required."
        fi

        log "═══════════════════════════════════════════════════════════"
        log_error "DEPLOY FAILED — rolled back to ${prev_commit:0:8}"
        log "═══════════════════════════════════════════════════════════"
        exit 1
    fi

    # Clean up backup
    rm -rf "${FRONTEND_DIST}.bak"
}

main "$@"
