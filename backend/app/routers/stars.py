from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Claim, Memory, Star
from ..schemas import MemoryOut, StarOut


router = APIRouter(prefix="/api/stars", tags=["stars"])


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def active_claim(db: Session, star_id: str) -> Claim | None:
    claims = db.scalars(
        select(Claim)
        .where(Claim.star_id == star_id, Claim.status.in_(["pending_verification", "verified"]))
        .order_by(Claim.claimed_at.desc())
    ).all()
    now = utcnow()
    for claim in claims:
        if claim.status == "pending_verification" and claim.verification_expires_at <= now:
            claim.status = "expired"
            continue
        return claim
    db.commit()
    return None


def serialize_star(db: Session, star: Star) -> StarOut:
    active = active_claim(db, star.id)
    memories = db.scalars(
        select(Memory)
        .join(Claim, Memory.claim_id == Claim.id)
        .where(Claim.star_id == star.id, Claim.status == "verified", Memory.published_at.is_not(None))
        .order_by(Memory.created_at.asc())
    ).all()

    claimants = {
        claim.id: claim.display_name
        for claim in db.scalars(select(Claim).where(Claim.id.in_([m.claim_id for m in memories]))).all()
    }
    history = [
        MemoryOut(
            id=memory.id,
            claimant=claimants.get(memory.claim_id, "UNKNOWN"),
            type=memory.type,
            text=memory.text,
            link=memory.external_url,
            media_url=memory.media_url,
            name=memory.media_name,
            created_at=memory.created_at,
        )
        for memory in memories
    ]

    status = "available"
    available_at = star.available_at
    if available_at and available_at > utcnow():
        status = "resting"
    elif active:
        status = "claimed"

    return StarOut(
        id=star.id,
        street=star.street,
        lat=star.lat,
        lon=star.lon,
        status=status,
        claim_id=active.id if active else None,
        claimant=active.display_name if active else None,
        claim_status=active.status if active else None,
        verification_expires_at=active.verification_expires_at if active and active.status == "pending_verification" else None,
        available_at=available_at if status == "resting" else None,
        history=history,
    )


@router.get("", response_model=list[StarOut])
def list_stars(db: Session = Depends(get_db)):
    return [serialize_star(db, star) for star in db.scalars(select(Star).order_by(Star.id)).all()]


@router.get("/{star_id}", response_model=StarOut)
def get_star(star_id: str, db: Session = Depends(get_db)):
    star = db.get(Star, star_id)
    if not star:
        raise HTTPException(404, "Star not found")
    return serialize_star(db, star)
