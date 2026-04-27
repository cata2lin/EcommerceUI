"""TOM API runtime configuration — stored in DB (single-row tom_api_config)."""
from __future__ import annotations

import os
import time
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.core.tom_client import (
    get_config,
    invalidate_config_cache,
    tom_fetch,
)
from api.routes.auth import get_current_user
from db.session import get_db


router = APIRouter()


def _mask_secret(s: Optional[str]) -> str:
    if not s:
        return ""
    if len(s) <= 12:
        return "*" * len(s)
    return f"{s[:6]}{'*' * (len(s) - 10)}{s[-4:]}"


def _read_db_row(db: Session) -> dict:
    row = db.execute(
        text(
            "SELECT base_url, api_key_id, api_secret, source_code, "
            "       updated_at "
            "FROM tom_api_config WHERE id = 1"
        )
    ).fetchone()
    if not row:
        return {
            "base_url": "",
            "api_key_id": "",
            "api_secret": "",
            "source_code": "",
            "updated_at": None,
        }
    return {
        "base_url": row[0] or "",
        "api_key_id": row[1] or "",
        "api_secret": row[2] or "",
        "source_code": row[3] or "",
        "updated_at": row[4].isoformat() if row[4] else None,
    }


def _serialize(db_row: dict) -> dict:
    """Public response: never returns the raw secret."""
    return {
        "db": {
            "base_url": db_row["base_url"],
            "api_key_id": db_row["api_key_id"],
            "api_secret_masked": _mask_secret(db_row["api_secret"]),
            "api_secret_set": bool(db_row["api_secret"]),
            "source_code": db_row["source_code"],
            "updated_at": db_row["updated_at"],
        },
        "env_fallback": {
            "base_url": os.getenv("TOM_BASE_URL", ""),
            "api_key_id": os.getenv("TOM_API_KEY_ID", ""),
            "api_secret_set": bool(os.getenv("TOM_API_SECRET", "")),
            "source_code": os.getenv("TOM_SOURCE_CODE", ""),
        },
        "active": {
            "base_url": get_config()["base_url"],
            "api_key_id": get_config()["api_key_id"],
            "api_secret_masked": _mask_secret(get_config()["api_secret"]),
            "source_code": get_config()["source_code"],
            "configured": bool(
                get_config()["base_url"]
                and get_config()["api_key_id"]
                and get_config()["api_secret"]
            ),
        },
    }


# ─── GET ────────────────────────────────────────────────────────────
@router.get("/api/tom-config")
def get_tom_config(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    invalidate_config_cache()
    return _serialize(_read_db_row(db))


# ─── PUT (save) ─────────────────────────────────────────────────────
class TomConfigBody(BaseModel):
    base_url: Optional[str] = None
    api_key_id: Optional[str] = None
    api_secret: Optional[str] = None  # leave empty to keep existing
    source_code: Optional[str] = None


@router.put("/api/tom-config")
def update_tom_config(
    body: TomConfigBody,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    base_url = (body.base_url or "").strip().rstrip("/") or None
    api_key_id = (body.api_key_id or "").strip() or None
    source_code = (body.source_code or "").strip() or None
    api_secret = body.api_secret  # may be None (keep) or non-empty string (replace)

    sets = ["base_url = :base_url", "api_key_id = :api_key_id",
            "source_code = :source_code", "updated_at = now()"]
    params: dict[str, Any] = {
        "base_url": base_url,
        "api_key_id": api_key_id,
        "source_code": source_code,
    }
    if api_secret is not None and api_secret.strip() != "":
        sets.append("api_secret = :api_secret")
        params["api_secret"] = api_secret.strip()

    db.execute(
        text(
            "INSERT INTO tom_api_config (id, base_url, api_key_id, api_secret, source_code) "
            "VALUES (1, :base_url, :api_key_id, :api_secret_init, :source_code) "
            "ON CONFLICT (id) DO UPDATE SET " + ", ".join(sets)
        ),
        {**params, "api_secret_init": (api_secret or "").strip() or None},
    )
    db.commit()
    invalidate_config_cache()
    return _serialize(_read_db_row(db))


# ─── DELETE secret only (keep other fields) ─────────────────────────
@router.delete("/api/tom-config/secret")
def clear_tom_secret(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    db.execute(
        text("UPDATE tom_api_config SET api_secret = NULL, updated_at = now() WHERE id = 1")
    )
    db.commit()
    invalidate_config_cache()
    return _serialize(_read_db_row(db))


# ─── DELETE entire row ──────────────────────────────────────────────
@router.delete("/api/tom-config")
def clear_tom_config(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    db.execute(
        text(
            "UPDATE tom_api_config SET base_url=NULL, api_key_id=NULL, "
            "api_secret=NULL, source_code=NULL, updated_at=now() WHERE id = 1"
        )
    )
    db.commit()
    invalidate_config_cache()
    return _serialize(_read_db_row(db))


# ─── POST /test ─────────────────────────────────────────────────────
@router.post("/api/tom-config/test")
async def test_tom_connection(
    body: Optional[TomConfigBody] = Body(default=None),
    _user=Depends(get_current_user),
):
    """Test the TOM connection. If `body` is provided with credentials,
    those are used for the test (without saving). Otherwise the active
    config is used."""
    invalidate_config_cache()
    cfg = get_config()
    base = cfg["base_url"]
    key = cfg["api_key_id"]
    secret = cfg["api_secret"]
    source = cfg["source_code"]

    if body is not None:
        if body.base_url:
            base = body.base_url.strip().rstrip("/")
        if body.api_key_id:
            key = body.api_key_id.strip()
        if body.api_secret and body.api_secret.strip():
            secret = body.api_secret.strip()
        if body.source_code:
            source = body.source_code.strip()

    if not (base and key and secret):
        raise HTTPException(400, "Provide base_url, api_key_id and api_secret to test.")

    # Build a minimal HMAC GET against /api/v1/po/{source}/__handshake_probe__
    import hashlib
    import hmac
    import httpx

    path = f"/api/v1/po/{source or 'GRANDIA'}/__handshake_probe__"
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(b"").hexdigest()
    canonical = "\n".join(["GET", path, ts, body_hash])
    sig = hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()

    headers = {
        "X-Tom-Key": key,
        "X-Tom-Timestamp": ts,
        "X-Tom-Signature": sig,
    }
    started = time.time()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base}{path}", headers=headers)
        elapsed_ms = int((time.time() - started) * 1000)
        try:
            payload = resp.json()
        except Exception:
            payload = {}

        # Interpret status
        status = resp.status_code
        if status == 401:
            return {
                "ok": False,
                "status": status,
                "elapsed_ms": elapsed_ms,
                "diagnosis": "signature_invalid",
                "message": "HMAC signature rejected. Check API Key ID and Secret.",
                "body": payload,
            }
        if status == 403:
            return {
                "ok": False,
                "status": status,
                "elapsed_ms": elapsed_ms,
                "diagnosis": "source_code_mismatch",
                "message": (
                    f"Source code '{source}' does not match this API key. "
                    "Update the Source Code field to the value registered with TOM."
                ),
                "body": payload,
            }
        if status == 404:
            return {
                "ok": True,
                "status": status,
                "elapsed_ms": elapsed_ms,
                "diagnosis": "ok",
                "message": (
                    "Connection OK. HMAC and source code accepted "
                    "(probe PO not found, as expected)."
                ),
                "body": payload,
            }
        if 200 <= status < 300:
            return {
                "ok": True,
                "status": status,
                "elapsed_ms": elapsed_ms,
                "diagnosis": "ok",
                "message": "Connection OK.",
                "body": payload,
            }
        return {
            "ok": False,
            "status": status,
            "elapsed_ms": elapsed_ms,
            "diagnosis": "unexpected",
            "message": f"Unexpected status {status} from TOM.",
            "body": payload,
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "status": 0,
            "elapsed_ms": int((time.time() - started) * 1000),
            "diagnosis": "network_error",
            "message": f"Network error reaching TOM: {e}",
            "body": {},
        }
