# SignalForge

Private editorial and production control plane for evidence-led, faceless
YouTube channels. Discovery, research, claims, media production, and release
authority are separated by persistent gates.

## Local development

```bash
npm install
DATABASE_URL=postgresql://localhost:5432/signalforge_local npm run db:migrate
DATABASE_URL=postgresql://localhost:5432/signalforge_local npm run db:seed
DATABASE_URL=postgresql://localhost:5432/signalforge_local AUTH_REQUIRED=true \
  SESSION_SECRET=replace-with-at-least-32-characters PORT=5195 npm run dev
```

## Production

Required variables:

- `APP_ENV=production`
- `DATABASE_URL`
- `SESSION_SECRET` (at least 32 characters)
- `AUTH_REQUIRED=true`

Provider variables are optional at boot. Missing provider credentials leave
jobs in explicit waiting states; they never bypass editorial or owner review.
See `.env.example` for YouTube, Google OAuth, OpenAI, voice, and render keys.

Build and start:

```bash
npm run check
npm run build
npm start
```

Health endpoints:

- `/api/health/live` — process liveness
- `/api/health/ready` — database readiness
- `/api/health` — connector summary
- `/api/operations/status` — authenticated runtime and queue metrics

Apply migrations as a release step:

```bash
npm run db:migrate
```

Publishing scope is deliberately disabled. A completed provider artifact,
owner review, and explicit final release approval are separate controls.
