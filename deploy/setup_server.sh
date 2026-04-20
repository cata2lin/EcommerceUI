#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# setup_server.sh — One-Time Server Bootstrap
# ═══════════════════════════════════════════════════════════════════════
# Designed for: root@vmi2680831 (38.242.226.83)
# Existing repo: /root/EcommerceUI (already cloned)
# Existing venv: /root/EcommerceUI/venv
#
# Usage: Run from the project directory on the server:
#   cd ~/EcommerceUI && bash deploy/setup_server.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
PROJECT_DIR="/root/EcommerceUI"
VENV_DIR="${PROJECT_DIR}/venv"
WEBHOOK_SECRET_FILE="${PROJECT_DIR}/deploy/.webhook_secret"
HASH_DIR="/var/lib/ecommerce-deploy"

echo "═══════════════════════════════════════════════════════════"
echo "  E-Commerce BI Platform — Server Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── Step 1: System Dependencies ────────────────────────────────────
echo "[1/7] Checking system dependencies..."
apt-get update -qq

# Install curl and ufw if missing
apt-get install -y -qq curl ufw > /dev/null 2>&1 || true

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

# ─── Step 2: Pull latest code ───────────────────────────────────────
echo ""
echo "[2/7] Pulling latest code..."
cd "${PROJECT_DIR}"
git pull origin main
echo "       ✅ Code up to date"

# ─── Step 3: Python dependencies ────────────────────────────────────
echo ""
echo "[3/7] Installing Python dependencies..."
if [ ! -d "${VENV_DIR}" ]; then
    echo "       Creating virtualenv..."
    python3 -m venv "${VENV_DIR}"
fi
"${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/requirements.txt" -q
echo "       ✅ Python deps installed"

# ─── Step 4: Frontend build ─────────────────────────────────────────
echo ""
echo "[4/7] Building frontend..."
cd "${PROJECT_DIR}/frontend"
npm install --silent
npm run build
cd "${PROJECT_DIR}"
echo "       ✅ Frontend built"

# ─── Step 5: Webhook Secret ─────────────────────────────────────────
echo ""
echo "[5/7] Setting up webhook secret..."
if [ ! -f "${WEBHOOK_SECRET_FILE}" ]; then
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

# ─── Step 6: Install Systemd Services ───────────────────────────────
echo ""
echo "[6/7] Installing systemd services..."

# Create hash storage directory
mkdir -p "${HASH_DIR}"

# Make deploy script executable
chmod +x "${PROJECT_DIR}/deploy/autodeploy.sh"

# Stop the existing uvicorn process if running (user was running it manually)
echo "       Stopping any existing uvicorn processes..."
pkill -f "uvicorn api.main:app" 2>/dev/null || true
sleep 2

# Copy service files
cp "${PROJECT_DIR}/deploy/ecommerce-api.service" /etc/systemd/system/
cp "${PROJECT_DIR}/deploy/ecommerce-webhook.service" /etc/systemd/system/

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable ecommerce-api.service
systemctl enable ecommerce-webhook.service

# Start services
systemctl restart ecommerce-api.service
systemctl restart ecommerce-webhook.service

echo "       ✅ Systemd services installed and started"

# ─── Step 7: Firewall ───────────────────────────────────────────────
echo ""
echo "[7/7] Configuring firewall..."
ufw allow 22/tcp    > /dev/null 2>&1 || true
ufw allow 8000/tcp  > /dev/null 2>&1 || true
ufw allow 9000/tcp  > /dev/null 2>&1 || true
ufw allow 5432/tcp  > /dev/null 2>&1 || true  # PostgreSQL
echo "       Ports: 22 (SSH), 5432 (PG), 8000 (API), 9000 (Webhook)"

# Don't force-enable ufw if not already active — could lock out SSH
if ! ufw status | grep -q "active"; then
    echo "       ⚠️  UFW is not active. Enable manually: ufw --force enable"
else
    echo "       ✅ Firewall already active"
fi

# ─── Verify Services ────────────────────────────────────────────────
echo ""
echo "Verifying services..."
sleep 3

API_STATUS=$(systemctl is-active ecommerce-api 2>/dev/null || echo "inactive")
WH_STATUS=$(systemctl is-active ecommerce-webhook 2>/dev/null || echo "inactive")

echo "  API service:     ${API_STATUS}"
echo "  Webhook service: ${WH_STATUS}"

# Health check
sleep 2
if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "  Health check:    ✅ OK"
else
    echo "  Health check:    ⚠️  Not responding yet (may need a few more seconds)"
fi

if curl -sf http://localhost:9000/health > /dev/null 2>&1; then
    echo "  Webhook health:  ✅ OK"
else
    echo "  Webhook health:  ⚠️  Not responding yet"
fi

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
echo "  Next Step: Configure GitHub webhook"
echo "    → https://github.com/cata2lin/EcommerceUI/settings/hooks/new"
echo "    → Payload URL: http://38.242.226.83:9000/webhook"
echo "    → Content type: application/json"
echo "    → Secret: $(cat ${WEBHOOK_SECRET_FILE} 2>/dev/null || echo 'CHECK FILE')"
echo "    → Events: Just the push event"
echo ""
