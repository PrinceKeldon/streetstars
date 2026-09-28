from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class MemoryOut(BaseModel):
    id: str
    claimant: str
    type: str
    text: str | None = None
    link: str | None = None
    media_url: str | None = None
    name: str | None = None
    created_at: datetime


class StarOut(BaseModel):
    id: str
    street: str
    lat: float
    lon: float
    status: str
    claim_id: str | None = None
    claimant: str | None = None
    claim_status: str | None = None
    verification_expires_at: datetime | None = None
    available_at: datetime | None = None
    history: list[MemoryOut] = []


class ClaimCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    lat: float
    lon: float


class ClaimOut(BaseModel):
    id: str
    star_id: str
    status: str
    display_name: str
    verification_expires_at: datetime


class VerificationCreate(BaseModel):
    email: EmailStr


class ReleaseOut(BaseModel):
    status: str
    available_at: datetime
