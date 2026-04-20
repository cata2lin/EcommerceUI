#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# setup_server.sh — One-Time Server Bootstrap
# ═══════════════════════════════════════════════════════════════════════
# Run this ONCE on a fresh server to set up everything.
#
# Usage:
#   ssh root@38.242.226.83
#   curl -sL https://raw.githubusercontent.com/cata2lin/EcommerceUI/main/deploy/setup_server.sh | bash
#   OR
#   scp setup_server.sh root@38.242.226.83:/tmp/ && ssh root@38.242.226.83 'bash /tmp/setup_server.sh'
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
PROJECT_DIR="/opt/ecommerce"
REPO_URL="https://github.com/cata2lin/EcommerceUI.git"
GIT_BRANCH="main"
WEBHOOK_SECRET_FILE="${PROJECT_DIR}/deploy/.webhook_secret"
HASH_DIR="/var/lib/ecommerce-deploy"

echo "═══════════════════════════════════════════════════════════"
echo "  E-Commerce BI Platform — Server Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Step 1: System Dependencies ────────────────────────────────────
echo "[1/8] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv git curl ufw > /dev/null

# Check if Node.js is installed, if not install Node 20 LTS
if ! command -v node &> /dev/null; then
    echo "       Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null
fi

echo "       Python: $(python3 --version)"
echo "       Node:   $(node --version)"
echo "       npm:    $(npm --version)"
echo "       ✅ System dependencies OK"

# ─── Step 2: Clone Repository ───────────────────────────────────────
echo ""
if [ -d "${PROJECT_DIR}/.git" ]; then
    echo "[2/8] Repository already exists at ${PROJECT_DIR}. Pulling latest..."
    cd "${PROJECT_DIR}"
    git fetch origin "${GIT_BRANCH}"
    git reset --hard "origin/${GIT_BRANCH}"
else
    echo "[2/8] Cloning repository..."
    git clone -b "${GIT_BRANCH}" "${REPO_URL}" "${PROJECT_DIR}"
    cd "${PROJECT_DIR}"
fi
echo "       ✅ Repository ready"

# ─── Step 3: Python Virtual Environment ─────────────────────────────
echo ""
echo "[3/8] Setting up Python virtual environment..."
if [ ! -d "${PROJECT_DIR}/.venv" ]; then
    python3 -m venv "${PROJECT_DIR}/.venv"
fi
"${PROJECT_DIR}/.venv/bin/pip" install -r "${PROJECT_DIR}/requirements.txt" -q
echo "       ✅ Python venv ready"

# ─── Step 4: Frontend Dependencies & Build ──────────────────────────
echo ""
echo "[4/8] Installing frontend dependencies and building..."
cd "${PROJECT_DIR}/frontend"
npm install --silent
npm run build
cd "${PROJECT_DIR}"
echo "       ✅ Frontend built"

# ─── Step 5: Environment File ───────────────────────────────────────
echo ""
if [ ! -f "${PROJECT_DIR}/.env" ]; then
    echo "[5/8] Creating .env file from template..."
    cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
    echo ""
    echo "  ⚠️  IMPORTANT: Edit ${PROJECT_DIR}/.env with your production values!"
    echo "     nano ${PROJECT_DIR}/.env"
    echo ""
else
    echo "[5/8] .env file already exists — skipping."
fi
echo "       ✅ Environment file ready"

# ─── Step 6: Webhook Secret ─────────────────────────────────────────
echo ""
echo "[6/8] Setting up webhook secret..."
if [ ! -f "${WEBHOOK_SECRET_FILE}" ]; then
    # Generate a random 32-char secret
    GENERATED_SECRET=$(openssl rand -hex 16)
    echo "${GENERATED_SECRET}" > "${WEBHOOK_SECRET_FILE}"
    chmod 600 "${WEBHOOK_SECRET_FILE}"
    echo ""
    echo "  ════════════════════════════════════════════════════════"
    echo "  🔑 WEBHOOK SECRET (save this for GitHub configuration):"
    echo "     ${GENERATED_SECRET}"
    echo "  ════════════════════════════════════════════════════════"
    echo ""
else
    echo "       Webhook secret already exists."
    echo "       Current secret: $(cat ${WEBHOOK_SECRET_FILE})"
fi
echo "       ✅ Webhook secret ready"

# ─── Step 7: Install Systemd Services ───────────────────────────────
echo ""
echo "[7/8] Installing systemd services..."

# Create hash storage directory
mkdir -p "${HASH_DIR}"

# Make deploy script executable
chmod +x "${PROJECT_DIR}/deploy/autodeploy.sh"

# Copy service files
cp "${PROJECT_DIR}/deploy/ecommerce-api.service" /etc/systemd/system/
cp "${PROJECT_DIR}/deploy/ecommerce-webhook.service" /etc/systemd/system/

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable ecommerce-api.service
systemctl enable ecommerce-webhook.service

# Start services
systemctl start ecommerce-api.service
systemctl start ecommerce-webhook.service

echo "       ✅ Systemd services installed and started"

# ─── Step 8: Firewall ───────────────────────────────────────────────
echo ""
echo "[8/8] Configuring firewall..."
ufw allow 22/tcp    > /dev/null 2>&1  # SSH
ufw allow 8000/tcp  > /dev/null 2>&1  # API
ufw allow 9000/tcp  > /dev/null 2>&1  # Webhook
ufw --force enable  > /dev/null 2>&1
echo "       Ports opened: 22 (SSH), 8000 (API), 9000 (Webhook)"
echo "       ✅ Firewall configured"

# ─── Summary ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Services:"
echo "    API:     systemctl status ecommerce-api"
echo "    Webhook: systemctl status ecommerce-webhook"
echo ""
echo "  URLs:"
echo "    App:     http://38.242.226.83:8000"
echo "    Health:  http://38.242.226.83:8000/api/health"
echo "    Webhook: http://38.242.226.83:9000/webhook"
echo ""
echo "  Logs:"
echo "    Deploy:  tail -f /var/log/ecommerce-deploy.log"
echo "    Webhook: journalctl -u ecommerce-webhook -f"
echo "    API:     journalctl -u ecommerce-api -f"
echo ""
echo "  Next Steps:"
echo "    1. Edit .env:  nano ${PROJECT_DIR}/.env"
echo "    2. Configure GitHub webhook:"
echo "       → https://github.com/cata2lin/EcommerceUI/settings/hooks/new"
echo "       → Payload URL: http://38.242.226.83:9000/webhook"
echo "       → Content type: application/json"
echo "       → Secret: $(cat ${WEBHOOK_SECRET_FILE})"
echo "       → Events: Just the push event"
echo ""
