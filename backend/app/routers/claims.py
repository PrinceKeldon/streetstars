import math
import os
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Claim, Memory, Star, VerificationToken
from ..schemas import ClaimCreate, ClaimOut, ReleaseOut, VerificationCreate
from ..services import hash_token, new_token, send_verification_email, upload_to_supabase, utcnow


router = APIRouter(prefix="/api", tags=["claims"])

FOUND_RADIUS_METRES = 75
MAX_MESSAGE_LENGTH = 2000
MAX_PHOTO_BYTES = 8 * 1024 * 1024
MEMORY_TYPES = {"message", "photo", "song", "link"}


def distance_metres(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6371000
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def expire_if_needed(claim: Claim, db: Session) -> bool:
    if claim.status == "pending_verification" and claim.verification_expires_at <= utcnow():
        claim.status = "expired"
        db.commit()
        return True
    return False


def active_claim(db: Session, star_id: str) -> Claim | None:
    claims = db.scalars(
        select(Claim)
        .where(Claim.star_id == star_id, Claim.status.in_(["pending_verification", "verified"]))
        .order_by(Claim.claimed_at.desc())
    ).all()
    for claim in claims:
        if expire_if_needed(claim, db):
            continue
        return claim
    return None


@router.post("/stars/{star_id}/claims", response_model=ClaimOut)
def create_claim(star_id: str, payload: ClaimCreate, db: Session = Depends(get_db)):
    star = db.get(Star, star_id)
    if not star:
        raise HTTPException(404, "Star not found")
    now = utcnow()
    if star.available_at and star.available_at > now:
        raise HTTPException(409, "Star is resting")
    if active_claim(db, star_id):
        raise HTTPException(409, "Star is already claimed")
    if distance_metres(payload.lat, payload.lon, star.lat, star.lon) > FOUND_RADIUS_METRES:
        raise HTTPException(403, "You must be within 75 metres of the Star to claim it")

    claim = Claim(
        star_id=star_id,
        display_name=payload.display_name.strip(),
        status="pending_verification",
        verification_expires_at=now + timedelta(hours=24),
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    return ClaimOut(
        id=claim.id,
        star_id=claim.star_id,
        status=claim.status,
        display_name=claim.display_name,
        verification_expires_at=claim.verification_expires_at,
    )


@router.post("/claims/{claim_id}/memory")
async def save_memory(
    claim_id: str,
    type: str = Form(...),
    text: str | None = Form(default=None),
    external_url: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    claim = db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    if expire_if_needed(claim, db):
        raise HTTPException(410, "This claim has expired")
    if claim.status != "pending_verification":
        raise HTTPException(409, "Only a pending claim can receive a memory")
    if type not in MEMORY_TYPES:
        raise HTTPException(400, "Unsupported memory type")

    text = (text or "").strip() or None
    external_url = (external_url or "").strip() or None
    if text and len(text) > MAX_MESSAGE_LENGTH:
        raise HTTPException(413, "Memory text is too long")
    if type in {"song", "link"} and not external_url:
        raise HTTPException(400, "A link is required for this memory type")
    if type == "message" and not text:
        raise HTTPException(400, "A message is required")
    if type == "photo" and not file:
        raise HTTPException(400, "A photo is required")

    media_url = None
    media_name = None
    if file:
        if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            raise HTTPException(415, "Unsupported image type")
        data = await file.read()
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Photo must be 8 MB or smaller")
        media_url = await upload_to_supabase(data=data, content_type=file.content_type, filename=file.filename or "memory")
        media_name = file.filename

    existing = db.scalar(select(Memory).where(Memory.claim_id == claim.id))
    if existing:
        existing.type = type
        existing.text = text
        existing.external_url = external_url
        existing.media_url = media_url or existing.media_url
        existing.media_name = media_name or existing.media_name
        existing.published_at = None
    else:
        db.add(Memory(
            claim_id=claim.id,
            type=type,
            text=text,
            external_url=external_url,
            media_url=media_url,
            media_name=media_name,
        ))
    db.commit()
    return {"status": "saved", "claim_id": claim.id}


@router.post("/claims/{claim_id}/verification")
async def send_verification(claim_id: str, payload: VerificationCreate, db: Session = Depends(get_db)):
    claim = db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    if expire_if_needed(claim, db):
        raise HTTPException(410, "This claim has expired")
    if claim.status != "pending_verification":
        raise HTTPException(409, "Claim is no longer pending")

    memory = db.scalar(select(Memory).where(Memory.claim_id == claim.id))
    if not memory:
        raise HTTPException(400, "Leave something on the Star before verifying")

    claim.email = str(payload.email).lower().strip()
    if claim.token:
        db.delete(claim.token)
        db.flush()

    token = new_token()
    claim.token = VerificationToken(
        token_hash=hash_token(token),
        expires_at=claim.verification_expires_at,
    )
    db.commit()

    star = db.get(Star, claim.star_id)
    link = await send_verification_email(
        email=claim.email,
        display_name=claim.display_name,
        street=star.street,
        star_id=star.id,
        token=token,
    )
    return {"status": "sent", "verification_link": link}


@router.get("/verify/{token}")
def verify(token: str, star: str | None = None, db: Session = Depends(get_db)):
    record = db.scalar(select(VerificationToken).where(VerificationToken.token_hash == hash_token(token)))
    if not record:
        raise HTTPException(404, "Verification link is invalid")
    if record.used_at or record.expires_at <= utcnow():
        raise HTTPException(410, "Verification link has expired")

    claim = db.get(Claim, record.claim_id)
    if not claim or claim.status != "pending_verification":
        raise HTTPException(409, "Claim is no longer pending")

    claim.status = "verified"
    claim.verified_at = utcnow()
    record.used_at = utcnow()

    memory = db.scalar(select(Memory).where(Memory.claim_id == claim.id))
    if memory:
        memory.published_at = utcnow()

    db.commit()
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return RedirectResponse(url=f"{frontend}/?verified=1&star={claim.star_id}", status_code=303)


@router.post("/claims/{claim_id}/release", response_model=ReleaseOut)
def release_claim(claim_id: str, db: Session = Depends(get_db)):
    claim = db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    if claim.status != "verified":
        raise HTTPException(409, "Only a verified claim can be released")

    claim.status = "released"
    claim.released_at = utcnow()
    star = db.get(Star, claim.star_id)
    star.available_at = utcnow() + timedelta(hours=6)
    db.commit()
    return ReleaseOut(status="resting", available_at=star.available_at)
