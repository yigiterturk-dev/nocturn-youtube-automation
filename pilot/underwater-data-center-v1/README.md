# SignalForge Pilot 01 — The Cloud Has a Seabed

An original 60–90 second editorial documentary pilot based on Microsoft Project
Natick. The package is designed to prove the complete local production path:
source ledger, original narration, generated visual assets, captions, synthetic
ambient audio, deterministic FFmpeg assembly, thumbnail, and release metadata.

## Render

Requirements: macOS `say`, FFmpeg, FFprobe, and the six generated scene images
listed in `scenes.json`.

```bash
npm run pilot:underwater
```

Final outputs are written to `output/`:

- `final-video.mp4`
- `thumbnail.png`
- `captions.srt`
- `title-description-tags.json`
- `sources.json`
- `asset-rights.json`
- `production-report.json`

The video is a pilot artifact, not approved for automatic publishing.
