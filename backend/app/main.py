import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, SessionLocal, engine
from .models import Star
from .routers.claims import router as claims_router
from .routers.stars import router as stars_router


SEED = [
    ("BERLIN-001", "Oranienstraße", 52.499, 13.423),
    ("BERLIN-002", "Weserstraße", 52.545, 13.424),
    ("BERLIN-003", "Kastanienallee", 52.538, 13.411),
    ("BERLIN-004", "Karl-Marx-Allee", 52.518, 13.447),
    ("BERLIN-005", "Reichenberger Straße", 52.495, 13.431),
    ("BERLIN-006", "Warschauer Straße", 52.506, 13.451),
]


def seed_stars():
    db = SessionLocal()
    try:
        for star_id, street, lat, lon in SEED:
            if not db.get(Star, star_id):
                db.add(Star(id=star_id, street=street, lat=lat, lon=lon))
        db.commit()
    finally:
        db.close()


app = FastAPI(title="Street Stars API", version="0.1.0")

origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stars_router)
app.include_router(claims_router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    seed_stars()


@app.get("/health")
def health():
    return {"ok": True, "service": "streetstars-api"}
