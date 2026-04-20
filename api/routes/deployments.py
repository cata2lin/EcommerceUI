"""
Deployments API — Parse deploy logs and webhook events into structured
deployment history with status, timing, commit info, and log output.
"""
import os
import re
from datetime import datetime
from fastapi import APIRouter, Depends
from api.routes.auth import get_current_user

router = APIRouter()

DEPLOY_LOG = "/var/log/ecommerce-deploy.log"
WEBHOOK_LOG = "/var/log/ecommerce-webhook.log"


def _parse_deploy_log() -> list[dict]:
    """Parse the deploy log file into individual deployment entries."""
    if not os.path.isfile(DEPLOY_LOG):
        return []

    with open(DEPLOY_LOG, "r") as f:
        content = f.read()

    # Split by deploy boundaries
    deploys = []
    # Each deploy starts with "DEPLOY STARTED" and ends with "DEPLOY COMPLETE" or "DEPLOY FAILED"
    deploy_blocks = re.split(
        r"(?=\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] ═+\n\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] 🚀 DEPLOY STARTED)",
        content,
    )

    for block in deploy_blocks:
        block = block.strip()
        if not block or "DEPLOY STARTED" not in block:
            continue

        entry: dict = {
            "status": "unknown",
            "started_at": None,
            "finished_at": None,
            "duration_seconds": None,
            "commit_from": None,
            "commit_to": None,
            "steps": [],
            "log_lines": [],
            "errors": [],
        }

        lines = block.split("\n")
        for line in lines:
            entry["log_lines"].append(line)

            # Extract timestamp
            ts_match = re.match(r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]", line)
            timestamp = ts_match.group(1) if ts_match else None

            # Started
            if "DEPLOY STARTED" in line and timestamp:
                entry["started_at"] = timestamp

            # Current commit
            if "Current commit:" in line:
                match = re.search(r"Current commit: (\w+)", line)
                if match:
                    entry["commit_from"] = match.group(1)[:8]

            # Updated to commit
            if "Updated to commit:" in line:
                match = re.search(r"Updated to commit: (\w+)", line)
                if match:
                    entry["commit_to"] = match.group(1)[:8]

            # No new commits
            if "No new commits" in line:
                entry["status"] = "skipped"
                entry["commit_to"] = entry["commit_from"]

            # Steps
            step_match = re.search(r"\[(\d)/5\] (.+)", line)
            if step_match:
                entry["steps"].append({
                    "number": int(step_match.group(1)),
                    "description": step_match.group(2).strip(),
                    "timestamp": timestamp,
                })

            # Success markers
            if "✅" in line:
                step_desc = line.split("✅")[-1].strip() if "✅" in line else ""
                # Check for final success
                if "DEPLOY COMPLETE" in line:
                    entry["status"] = "success"
                    if timestamp:
                        entry["finished_at"] = timestamp

            # Error markers
            if "❌" in line or "ERROR" in line:
                entry["errors"].append(line.strip())
                if "DEPLOY FAILED" in line:
                    entry["status"] = "failed"
                    if timestamp:
                        entry["finished_at"] = timestamp

            # Rollback
            if "ROLLING BACK" in line:
                entry["status"] = "rolled_back"

            # Health check
            if "Health check passed" in line:
                if timestamp:
                    entry["finished_at"] = timestamp

        # Calculate duration
        if entry["started_at"] and entry["finished_at"]:
            try:
                start = datetime.strptime(entry["started_at"], "%Y-%m-%d %H:%M:%S")
                end = datetime.strptime(entry["finished_at"], "%Y-%m-%d %H:%M:%S")
                entry["duration_seconds"] = int((end - start).total_seconds())
            except ValueError:
                pass

        # If still unknown status but has finished timestamp, assume success
        if entry["status"] == "unknown" and entry["finished_at"]:
            entry["status"] = "success"

        deploys.append(entry)

    # Return newest first
    deploys.reverse()
    return deploys


@router.get("/api/deployments")
async def get_deployments(_user=Depends(get_current_user)):
    """Return structured deployment history parsed from deploy logs."""
    deploys = _parse_deploy_log()

    # Summary stats
    total = len(deploys)
    successful = sum(1 for d in deploys if d["status"] == "success")
    failed = sum(1 for d in deploys if d["status"] in ("failed", "rolled_back"))
    skipped = sum(1 for d in deploys if d["status"] == "skipped")

    return {
        "deployments": deploys,
        "summary": {
            "total": total,
            "successful": successful,
            "failed": failed,
            "skipped": skipped,
            "success_rate": round(successful / total * 100, 1) if total > 0 else 0,
        },
    }


@router.get("/api/deployments/live-log")
async def get_live_log(lines: int = 100, _user=Depends(get_current_user)):
    """Return the last N lines of the raw deploy log."""
    if not os.path.isfile(DEPLOY_LOG):
        return {"lines": [], "total_lines": 0}

    with open(DEPLOY_LOG, "r") as f:
        all_lines = f.readlines()

    tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
    return {
        "lines": [l.rstrip() for l in tail],
        "total_lines": len(all_lines),
    }


@router.post("/api/deployments/trigger")
async def trigger_manual_deploy(_user=Depends(get_current_user)):
    """Trigger a manual deployment (runs autodeploy.sh in background)."""
    import subprocess

    deploy_script = "/root/EcommerceUI/deploy/autodeploy.sh"
    if not os.path.isfile(deploy_script):
        return {"success": False, "error": "Deploy script not found"}

    try:
        subprocess.Popen(
            ["bash", deploy_script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {"success": True, "message": "Deploy triggered"}
    except Exception as e:
        return {"success": False, "error": str(e)}
