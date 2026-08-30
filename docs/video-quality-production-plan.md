# SignalForge Video Quality & Production Plan

Date: 2026-07-28  
Status: Approved working direction  
Production allowed: No — owner review remains mandatory

## Objective

Use SignalForge to turn validated YouTube trend opportunities into original,
high-quality faceless documentary videos without appearing on camera.

The target is not generic, fully AI-generated content. The target is an
AI-assisted documentary edit with traceable research, a coherent visual
identity, controlled pacing, and a mandatory human quality gate.

## End-to-end workflow

```text
YouTube market data
        ↓
Trend Engine V2
        ↓
Opportunity selection
        ↓
Independent source research
        ↓
Claim and evidence verification
        ↓
Original script
        ↓
Voiceover
        ↓
Scene and visual plan
        ↓
Asset collection and generation
        ↓
Editing, captions, sound, and render
        ↓
Human quality review
        ↓
Owner release approval
        ↓
YouTube upload
```

## Where videos will be created

SignalForge remains the control panel and source of truth.

- The panel manages trends, research, scripts, jobs, review, and approval.
- A separate render worker performs heavy media processing.
- Remotion provides deterministic scene composition.
- FFmpeg handles media normalization, audio mixing, captions, and final export.
- The first worker may run locally on the Mac.
- A dedicated CPU/GPU worker can replace the local worker when production
  volume increases.
- The web application should not perform heavy rendering inside the normal web
  request process.

## Proposed service stack

- Research and script: OpenAI
- Voiceover: ElevenLabs or a lower-cost TTS provider after voice tests
- Still images and diagrams: OpenAI Image API plus code-native graphics
- Stock and archival footage: licensed stock providers and reusable public
  archives with a rights ledger
- Selective AI video: Runway, Kling, or another reviewed provider
- Editing and composition: Remotion
- Media processing: FFmpeg
- Transcription or alignment: Whisper or script-based word timing
- Thumbnail: image generation plus controlled typography templates
- Publishing: YouTube OAuth, enabled only after explicit owner authorization

Provider credentials are stored server-side. Missing credentials leave jobs in
an explicit waiting state and never bypass quality gates.

## Quality direction

Fully AI-generated video is not the desired format. It tends to produce:

- inconsistent characters and environments;
- artificial motion and physics errors;
- repetitive visual language;
- weak connection between narration and imagery;
- generic pacing and an obvious automated-content feel.

The preferred format is an AI-assisted documentary edit.

### Recommended visual composition

- 45% licensed stock or archival footage
- 20% motion graphics and data visualization
- 15% original AI-generated still images
- 10% screen recordings, maps, documents, and source material
- 10% selectively generated AI video

These percentages are a starting contract, not a rigid quota. The subject and
available evidence determine the final mix.

## Non-negotiable quality rules

1. Every channel has a specific and consistent visual system.
2. Every episode opens with a strong hook and a deliberate first 20–30 seconds.
3. Normal shot duration targets roughly 3–6 seconds.
4. A visual cannot remain on screen merely to fill time.
5. Narration and imagery must communicate the same idea.
6. Voice delivery needs natural pauses, emphasis, and pronunciation review.
7. Music remains below narration and follows a defined loudness target.
8. Sound effects are selective and motivated.
9. Maps, diagrams, charts, and data animation are used where they clarify the
   story.
10. Typography, captions, color, and transitions remain consistent.
11. Source and licensing metadata is retained for every external asset.
12. AI-generated or synthetic media is labelled where platform rules require.
13. Thumbnail and title are tested separately from the video.
14. No video is uploaded automatically without final human review.

## Editorial quality gate

Before production:

- at least five independently verified sources;
- material claims linked to evidence;
- unsupported or conflicting claims explicitly flagged;
- a meaningfully original angle;
- no close paraphrase of a single source;
- copyright and licensing risks recorded.

Before release:

- final narration reviewed;
- every scene matched to the script;
- asset rights ledger complete;
- captions checked;
- music and voice levels checked;
- no broken, repeated, or obviously synthetic shots;
- render watched from beginning to end;
- final owner approval recorded.

## Pilot plan

Do not begin with a fully automated 8–10 minute episode.

1. Produce three different 60–90 second visual pilots.
2. Use the same narration excerpt for all three.
3. Compare hook strength, voice quality, pacing, visual consistency, production
   cost, and render time.
4. Select the strongest format.
5. Lock that format as the first channel production template.
6. Produce one full episode.
7. Review retention and click-through data.
8. Update the format based on measured performance.

## Required pilot variants

### Variant A — Archival documentary

Primarily stock and archival footage, restrained motion graphics, documentary
voice, and minimal AI-generated material.

### Variant B — Editorial systems

Documents, interfaces, maps, diagrams, charts, kinetic typography, and
structured visual explanations.

### Variant C — Cinematic hybrid

Stock footage plus carefully selected AI stills and short generated-video
moments, with stronger sound design.

## Standard output package

Each completed production should generate:

```text
final-video.mp4
thumbnail.png
captions.srt
title-description-tags.json
sources.json
asset-rights.json
production-report.json
```

## Current implementation state

Already implemented:

- Trend Engine V2
- niche watchlists;
- YouTube video deduplication;
- historical trend snapshots;
- views-per-hour and acceleration scoring;
- channel-relative outlier scoring;
- source ledger;
- claim verification;
- persistent research queue;
- persistent voiceover, visual-plan, and render queues;
- owner-only artifact review;
- final release approval gate;
- deliberately disabled YouTube publishing scope.
- one playable 77-second local pilot with original narration, generated stills,
  deterministic motion, captions, ambient audio, thumbnail, and rights ledger;
- a reusable local FFmpeg pilot renderer;
- caption timing, loudness normalization, and thumbnail generation for Pilot 01.

Still required for repeatable production output:

- OpenAI provider activation;
- voice provider integration and voice selection;
- asset provider integrations;
- licensing and asset-rights ledger automation;
- production composition templates or a generalized render worker;
- production music licensing/provider integration;
- thumbnail testing against measured click-through data;
- two additional pilot variants;
- approval of the first channel format;
- explicit YouTube upload authorization.

## Important conclusion

The videos can look genuinely good, but quality will not come from choosing one
AI model. It will come from the combination of:

- strong research;
- original editorial framing;
- a channel-specific visual system;
- disciplined scene rules;
- deliberate sound and pacing;
- tested production templates;
- and mandatory human review.

The automation should remove repetitive labor without removing editorial
judgment.
