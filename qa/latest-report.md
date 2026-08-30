# SignalForge prototype QA

Date: 2026-07-28

- TypeScript check: PASS
- Production build: PASS
- Desktop visual review: PASS
- Mobile 375 × 812 visual review: PASS
- New production brief mutation: PASS
- Pipeline advancement mutation: implemented
- Browser console errors and warnings: none
- Production publishing authority: false
- PostgreSQL migration: PASS (`signalforge_local`)
- PostgreSQL health: PASS
- Production configuration validation: PASS
- Security headers and API rate limiting: PASS
- Owner login: PASS
- Role resolution: PASS
- Unauthenticated mutation rejection: PASS (401)
- Logout and token revocation: PASS
- OAuth configuration status: PASS
- Missing Google credentials behavior: PASS (409)
- OAuth state migration: PASS
- Production dependency audit: PASS (0 vulnerabilities)
- AI provider status: PASS
- Editorial research queue: PASS (202)
- PostgreSQL production-job persistence: PASS
- Missing AI credential behavior: PASS (`waiting_for_provider`)
- Structured editorial contract: PASS (v1.0)
- Source ledger migration: PASS
- Source create and editorial verification: PASS
- Claim create and evidence verification: PASS (`supported`, 91% confidence)
- Research minimum-source gate: PASS (`waiting_for_sources`, 1/5)
- TypeScript check after evidence workflow: PASS
- Production build after evidence workflow: PASS
- Production dependency audit after evidence workflow: PASS (0 vulnerabilities)
- Voiceover production queue: PASS (`waiting_for_script`)
- Visual-plan production queue: PASS (`waiting_for_provider`)
- Render production queue: PASS (`waiting_for_script`)
- Owner artifact-review transition guard: PASS
- Final release approval gate: PASS (blocked with 409 before reviewed render)
- YouTube upload scope: DISABLED by design
- Structured request logging without response bodies: PASS
- Request correlation IDs: PASS
- Liveness endpoint: PASS (200)
- PostgreSQL readiness endpoint: PASS (200)
- Authenticated operations metrics: PASS (200)
- Unauthenticated operations metrics rejection: PASS (401)
- Production configuration fail-closed auth requirement: PASS
- Graceful SIGTERM/SIGINT drain: implemented
- Docker multi-stage build definition: PASS
- Railway deployment configuration: PASS
- Local production-build smoke test: PASS
- Trend Engine v2 schema migration: PASS
- Niche query + popular-feed candidate fusion: implemented
- YouTube video-ID deduplication/upsert: PASS
- Historical trend snapshots: PASS
- Snapshot-delta views/hour and acceleration: implemented
- Channel-relative outlier scoring: PASS
- Short/long-form classification: implemented
- Seven-component opportunity score: PASS
- Trend score regression fixture: PASS (emerging 96 > routine 60)
- Freshness regression fixture: PASS (fresh 96 > stale 71)
- Automatic watchlist scheduler: implemented (120-minute default)
- Missing YouTube credential fail-safe: PASS (409, no fabricated live data)

The local backend now uses PostgreSQL. YouTube live data is implemented but
awaits an API credential. Authentication and role enforcement are implemented.
YouTube channel OAuth is implemented and awaits Google client credentials for
live consent verification. The AI workflow contract and persistent queue are
implemented; live generation awaits five verified sources and a server-side
OpenAI API key. Voiceover, visual-plan, and render adapters now have persistent
queues and strict prerequisite/review gates; live media generation awaits
provider credentials. Billing and the deliberately disabled YouTube upload
scope remain incomplete.

The application is release-ready at the software layer. A live deployment,
external provider activation, and YouTube publishing authority require current
owner decisions and credentials; `production_allowed` remains false.

## Pilot 01 — local video production

Date: 2026-08-16

- Playable 16:9 pilot render: PASS
- Duration contract (60–90 seconds): PASS (77.1 seconds)
- Resolution and frame rate: PASS (1920 × 1080, 30 fps)
- Video/audio codecs: PASS (H.264/AAC)
- Full-file decode: PASS (no decoder errors)
- Integrated loudness: PASS (-15.98 LUFS; target -16 LUFS)
- Black-frame scan: PASS (no 0.5-second black segments)
- Silence scan: PASS (no 1-second segments below -45 dB)
- Scene count: PASS (8)
- Original narration script: PASS
- Generated scene visuals: PASS (6 unique stills)
- Burned-in captions and SRT sidecar: PASS
- Thumbnail and publishing metadata: PASS
- Final contact-sheet visual review: PASS
- Asset-rights ledger: PASS
- Automatic publishing: DISABLED
- Human owner review: PENDING

This pilot validates the complete local path from script and generated imagery
through narration, motion, audio mixing, captions, thumbnail, and FFmpeg render.
It is a format test backed by three official Microsoft sources; it does not
satisfy the five-source research gate required for a full production episode.
