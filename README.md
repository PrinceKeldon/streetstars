# Street Stars

**Give the streets a memory.**

Street Stars is an open-source experiment exploring a finite layer of digital Stars anchored to real streets.

## The primitive

**DISCOVER → WALK → FIND → CLAIM → LEAVE → VERIFY → RELEASE → DISCOVER**

A Star is a permanent place marker. A claim is temporary. A memory belongs to the person who leaves it there. Stars are not property and are not transferable.

A claim is provisional for 24 hours. Its memory is not published until the claimant verifies their identity through a passwordless magic link. If verification expires, the provisional claim and memory are wiped and the Star becomes available immediately.

When a verified claimant releases a Star, it enters a resting period. Its public memory remains permanent. The Star then becomes available again.

## MVP 01 — Berlin

Edition I · 2026–2030

The first primitive deliberately avoids marketplaces, payments, crypto, NFTs, followers, likes, comments, messaging, AI and advertising.

## Architecture

- **Frontend:** Next.js + MapLibre on Vercel
- **Backend:** FastAPI on Render
- **Database:** PostgreSQL
- **Media:** Supabase Storage
- **Verification email:** Resend

The browser is no longer the source of truth for claims or Star lifecycle. The backend enforces proximity, claim exclusivity, verification expiry and publication.

## Brand and software

The software in this repository is licensed under Apache-2.0. The **Street Stars** name, logo, visual identity and official Street Stars network are not granted by the software licence.

Independent developers may build other projects with the code. Use of the Street Stars brand or representation as an official city edition will be governed separately.
