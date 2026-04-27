"""
TOM API client — HMAC-SHA256 signed requests.

Config source order: tom_api_config DB row first, TOM_* env vars as fallback.

Canonical string: METHOD\\nPATH\\nTIMESTAMP\\nSHA256_HEX(body)
Headers X-Tom-Key, X-Tom-Timestamp, X-Tom-Signature are required on every
request. Idempotency-Key is required on write operations.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional, Tuple

import httpx
from sqlalchemy import text

from db.session import SessionLocal


# In-process cache; cleared by tom_config router after writes.
_CACHE: dict[str, str] = {}
_CACHE_TS: float = 0.0
_CACHE_TTL_S: float = 30.0


def invalidate_config_cache() -> None:
    global _CACHE, _CACHE_TS
    _CACHE = {}
    _CACHE_TS = 0.0


def _read_db_config() -> dict[str, str]:
    try:
        db = SessionLocal()
        try:
            row = db.execute(
                text(
                    "SELECT base_url, api_key_id, api_secret, source_code "
                    "FROM tom_api_config WHERE id = 1"
                )
            ).fetchone()
        finally:
            db.close()
        if not row:
            return {}
        return {
            "base_url": (row[0] or "").strip(),
            "api_key_id": (row[1] or "").strip(),
            "api_secret": (row[2] or "").strip(),
            "source_code": (row[3] or "").strip(),
        }
    except Exception:
        return {}


def get_config() -> dict[str, str]:
    """Resolve TOM config: DB first, env fallback per field. Cached for TTL."""
    global _CACHE, _CACHE_TS
    now = time.time()
    if _CACHE and (now - _CACHE_TS) < _CACHE_TTL_S:
        return _CACHE

    db_cfg = _read_db_config()
    cfg = {
        "base_url": (db_cfg.get("base_url") or os.getenv("TOM_BASE_URL", "")).rstrip("/"),
        "api_key_id": db_cfg.get("api_key_id") or os.getenv("TOM_API_KEY_ID", ""),
        "api_secret": db_cfg.get("api_secret") or os.getenv("TOM_API_SECRET", ""),
        "source_code": db_cfg.get("source_code") or os.getenv("TOM_SOURCE_CODE", "") or "GRANDIA",
    }
    _CACHE = cfg
    _CACHE_TS = now
    return cfg


def get_source_code() -> str:
    return get_config()["source_code"]


def is_tom_configured() -> bool:
    cfg = get_config()
    return bool(cfg["base_url"] and cfg["api_key_id"] and cfg["api_secret"])


def _sign(method: str, path: str, body: str, secret: str) -> Tuple[str, str]:
    ts = str(int(time.time()))
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical = "\n".join([method.upper(), path, ts, body_hash])
    sig = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return ts, sig


class TomResponse(dict):
    """Dict subclass for {'status': int, 'body': Any}."""


async def tom_fetch(
    method: str,
    path: str,
    body: Optional[Any] = None,
    idempotency_key: Optional[str] = None,
    timeout: float = 30.0,
) -> TomResponse:
    cfg = get_config()
    base, key, secret = cfg["base_url"], cfg["api_key_id"], cfg["api_secret"]
    if not (base and key and secret):
        raise RuntimeError(
            "TOM client not configured. Configure it in Purchase Orders → TOM API Config."
        )

    raw = json.dumps(body, separators=(",", ":"), ensure_ascii=False) if body is not None else ""
    ts, sig = _sign(method, path, raw, secret)

    headers = {
        "X-Tom-Key": key,
        "X-Tom-Timestamp": ts,
        "X-Tom-Signature": sig,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(
            method.upper(),
            f"{base}{path}",
            headers=headers,
            content=raw if raw else None,
        )
        try:
            parsed = resp.json()
        except Exception:
            parsed = {}
        return TomResponse(status=resp.status_code, body=parsed)
