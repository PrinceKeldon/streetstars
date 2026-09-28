from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class StarOut(BaseModel):
    id: str
    street: str
    lat: float
    lon: float
    status: str
    claimant: str | None = None
    claim_status: str | None = None
    verification_expires_at: datetime | None = None
    available_at: datetime | None = None
    history: list["MemoryOut"] = []


class MemoryOut(BaseModel):
    id: str
    claimant: str
    type: str
    text: str | None = None
    link: str | None = None
    media_url: str | None = None
    name: str | None = None
    created_at: datetime


class ClaimCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    lat: float
    lon: float


class ClaimOut(BaseModel):
    id: str
    star_id: str
    status: str
    display_name: str
    verification_expires_at: datetime
    verification_sent: bool = True
    verification_link: str | None = None


class MemoryCreate(BaseModel):
    type: str
    text: str | None = None
    external_url: str | None = None


class ReleaseOut(BaseModel):
    status: str
    available_at: datetime


StarOut.model_rebuild()
