#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
webhook_listener.py — GitHub Webhook Receiver for Auto-Deploy
═══════════════════════════════════════════════════════════════════════

Lightweight HTTP server (stdlib only, zero dependencies) that:
  • Listens on port 9000
  • Accepts POST /webhook from GitHub
  • Validates HMAC-SHA256 signature
  • Triggers autodeploy.sh on pushes to main
  • Returns 200 immediately (non-blocking deploy)

Runs as a systemd service via ecommerce-webhook.service
═══════════════════════════════════════════════════════════════════════
"""

import hmac
import hashlib
import json
import subprocess
import os
import sys
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# ─── Configuration ───────────────────────────────────────────────────
PORT = 9000
DEPLOY_SCRIPT = "/root/EcommerceUI/deploy/autodeploy.sh"
SECRET_FILE = "/root/EcommerceUI/deploy/.webhook_secret"
DEPLOY_BRANCH = "main"
LOG_FILE = "/var/log/ecommerce-webhook.log"

# ─── Logging Setup ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("webhook")


def load_secret() -> str:
    """Load the webhook secret from file."""
    try:
        with open(SECRET_FILE, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        logger.error(f"Webhook secret file not found: {SECRET_FILE}")
        logger.error("Create it with: echo 'your-secret' > %s", SECRET_FILE)
        sys.exit(1)


def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Validate GitHub's X-Hub-Signature-256 HMAC."""
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        secret.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()
    received = signature.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)


class WebhookHandler(BaseHTTPRequestHandler):
    """Handle incoming GitHub webhook POST requests."""

    secret = ""

    def log_message(self, format, *args):
        """Override default logging to use our logger."""
        logger.info(f"{self.client_address[0]} - {format % args}")

    def do_GET(self):
        """Health check endpoint."""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = json.dumps({
                "status": "ok",
                "service": "ecommerce-webhook",
                "timestamp": datetime.utcnow().isoformat(),
            })
            self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        """Process GitHub webhook payload."""
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        # Read payload
        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length)

        # Validate signature
        signature = self.headers.get("X-Hub-Signature-256", "")
        if not verify_signature(payload, signature, self.secret):
            logger.warning(
                f"Invalid signature from {self.client_address[0]}"
            )
            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid signature"}')
            return

        # Parse payload
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            logger.error("Malformed JSON payload")
            self.send_response(400)
            self.end_headers()
            return

        # Check event type
        event = self.headers.get("X-GitHub-Event", "")
        logger.info(f"Received event: {event}")

        if event == "ping":
            logger.info("Ping received — webhook configured correctly!")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status": "pong"}')
            return

        if event != "push":
            logger.info(f"Ignoring non-push event: {event}")
            self.send_response(200)
            self.end_headers()
            return

        # Check branch
        ref = data.get("ref", "")
        branch = ref.replace("refs/heads/", "")
        if branch != DEPLOY_BRANCH:
            logger.info(f"Ignoring push to branch '{branch}' (only deploying '{DEPLOY_BRANCH}')")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "ignored", "reason": f"branch '{branch}' is not '{DEPLOY_BRANCH}'"}).encode()
            )
            return

        # Extract push info for logging
        pusher = data.get("pusher", {}).get("name", "unknown")
        commits = data.get("commits", [])
        head_commit = data.get("head_commit", {})
        commit_msg = head_commit.get("message", "no message")[:80]
        commit_sha = head_commit.get("id", "unknown")[:8]

        logger.info("═══════════════════════════════════════════════════════")
        logger.info(f"🚀 DEPLOY TRIGGERED by {pusher}")
        logger.info(f"   Commit: {commit_sha} — {commit_msg}")
        logger.info(f"   Commits in push: {len(commits)}")
        logger.info("═══════════════════════════════════════════════════════")

        # Respond immediately (don't block GitHub)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(
            json.dumps({
                "status": "deploying",
                "commit": commit_sha,
                "branch": branch,
            }).encode()
        )

        # Trigger deploy asynchronously
        try:
            subprocess.Popen(
                ["bash", DEPLOY_SCRIPT],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            logger.info("Deploy script launched.")
        except Exception as e:
            logger.error(f"Failed to launch deploy script: {e}")


def main():
    """Start the webhook listener server."""
    secret = load_secret()
    WebhookHandler.secret = secret

    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    server.socket.setsockopt(__import__('socket').SOL_SOCKET, __import__('socket').SO_REUSEADDR, 1)
    logger.info(f"Webhook listener started on port {PORT}")
    logger.info(f"Deploy script: {DEPLOY_SCRIPT}")
    logger.info(f"Listening for pushes to branch: {DEPLOY_BRANCH}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Webhook listener shutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
