# Nocturn YouTube Automation

Private editorial and production control plane for evidence-led, faceless
YouTube channels. Discovery, research, claims, media production, and release
authority are separated by persistent gates.

## Local development

```bash
npm install
DATABASE_URL=postgresql://localhost:5432/nocturn_youtube_local npm run db:migrate
DATABASE_URL=postgresql://localhost:5432/nocturn_youtube_local npm run db:seed
DATABASE_URL=postgresql://localhost:5432/nocturn_youtube_local AUTH_REQUIRED=true \
  SESSION_SECRET=replace-with-at-least-32-characters PORT=5195 npm run dev
```


## Production pipeline

```text
Trend radar → video + 5 verified sources + supported claims
  → Script (DeepSeek: dossier, 5 hooks scored, 3 titles linted)   → owner approves → becomes the script
  → Visual plan (DeepSeek scenes + Pexels stock, 3 Shorts, thumb) → owner approves
  → Voiceover (ElevenLabs, per scene, word timings)               → owner approves
  → Render (FFmpeg: episode, 3 vertical Shorts, captions, chapters, thumbnail, upload package) → owner approves
  → Release approval → manual upload (API upload stays disabled)
```

Jobs run in a separate worker process, never in the web process:

```bash
npm run worker          # long-running; polls every WORKER_POLL_SECONDS
npm run worker:once     # drain the queue once
node dist/worker.cjs    # production (needs ffmpeg, ImageMagick and a font; see Dockerfile)
```

Keys: `DEEPSEEK_API_KEY`, `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`), `PEXELS_API_KEY` (free; without it scenes
fall back to generated typographic cards). Jobs waiting on a missing key move forward on their own once it is set.
Artifacts are written under `MEDIA_DIR/videos/<videoId>/`.

Checks: `npm run verify:quality` (hook/title/chapter gates, ported from
[youtube-agent-skill](https://github.com/Jakeschincariol/youtube-agent-skill), MIT) and `npm run verify:e2e`
(voiceover + render through the real worker using local macOS TTS).

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
