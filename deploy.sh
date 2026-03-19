#!/bin/bash
# deploy.sh — Build frontend and start production server
# Run from the project root: ./deploy.sh

set -e

echo "=== E-Commerce Intelligence Platform — Deploy ==="

# 1. Install Python dependencies
echo "[1/4] Installing Python dependencies..."
pip install -r requirements.txt -q

# 2. Install frontend dependencies
echo "[2/4] Installing frontend dependencies..."
cd frontend
npm install --silent
cd ..

# 3. Build frontend (outputs to api/frontend_dist/)
echo "[3/4] Building frontend for production..."
cd frontend
npm run build
cd ..

echo "[4/4] Build complete! Frontend built to api/frontend_dist/"
echo ""
echo "To start the server:"
echo "  python -m uvicorn api.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "The app will be available at http://your-server:8000"
