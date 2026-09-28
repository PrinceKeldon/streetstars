import hashlib
import os
import secrets
from datetime import datetime, timezone

import httpx


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def send_verification_email(*, email: str, display_name: str, street: str, star_id: str, token: str) -> str | None:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    api_url = os.getenv("API_PUBLIC_URL", "http://localhost:8000").rstrip("/")
    link = f"{api_url}/api/verify/{token}?star={star_id}"

    api_key = os.getenv("RESEND_API_KEY")
    sender = os.getenv("RESEND_FROM")
    if not api_key or not sender:
        return link

    payload = {
        "from": sender,
        "to": [email],
        "subject": "Keep your Street Star memory",
        "html": f"""
        <div style="background:#0a0a09;color:#f2eee5;padding:40px;font-family:Arial,sans-serif">
          <p style="letter-spacing:.18em;font-size:11px;color:#b6a58a">STREET STARS · BERLIN</p>
          <h1 style="font-size:32px;margin:20px 0">Welcome to the Stars.</h1>
          <p>Hi {display_name}, your claim at <strong>{street}</strong> is waiting to be verified.</p>
          <p><a href="{link}" style="display:inline-block;background:#c99b52;color:#0a0a09;padding:14px 20px;text-decoration:none;font-weight:bold">VERIFY MY STAR →</a></p>
          <p style="font-size:12px;color:#aaa">This link expires in 24 hours.</p>
        </div>
        """,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()

    return link if os.getenv("DEV_SHOW_VERIFICATION_LINK", "false").lower() == "true" else None


async def upload_to_supabase(*, data: bytes, content_type: str, filename: str) -> str:
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    bucket = os.getenv("SUPABASE_BUCKET", "streetstars")
    if not base or not key:
        raise RuntimeError("Supabase Storage is not configured")

    safe_name = secrets.token_hex(12) + os.path.splitext(filename)[1].lower()
    path = f"memories/{safe_name}"
    url = f"{base}/storage/v1/object/{bucket}/{path}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": content_type,
                "x-upsert": "false",
            },
            content=data,
        )
        response.raise_for_status()

    return f"{base}/storage/v1/object/public/{bucket}/{path}"
