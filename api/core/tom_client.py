"""
TOM API client — HMAC-SHA256 signed requests.

Ported from grandia-inventory/src/lib/tom-client.ts.
Spec: https://github.com/contact546/tom → docs/grandia-integration-prompt.md

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


def _env() -> Tuple[str, str, str]:
    return (
        os.getenv("TOM_BASE_URL", "").rstrip("/"),
        os.getenv("TOM_API_KEY_ID", ""),
        os.getenv("TOM_API_SECRET", ""),
    )


TOM_SOURCE_CODE = os.getenv("TOM_SOURCE_CODE", "GRANDIA")


def is_tom_configured() -> bool:
    base, key, sec = _env()
    return bool(base and key and sec)


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
    base, key, secret = _env()
    if not (base and key and secret):
        raise RuntimeError(
            "TOM client not configured. Set TOM_BASE_URL, TOM_API_KEY_ID, TOM_API_SECRET."
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
