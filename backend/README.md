# Street Stars API

FastAPI backend for persistent Stars, claims, verification and memories.

## Local

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

The API starts on `http://localhost:8000`.

The backend uses SQLite automatically when `DATABASE_URL` is omitted, which is useful for local development. Production should use PostgreSQL.

## Production services

- PostgreSQL for Star/Claim/Memory persistence
- Supabase Storage for uploaded photos
- Resend for passwordless verification email
- Render for the FastAPI service

The backend is the authority for the 75 m claim radius, 24-hour verification expiry, single active claim, publication of verified memories, and Star release/resting state.
