import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pilot = join(repo, "pilot", "underwater-data-center-v1");
const work = join(pilot, ".render-work");
const output = join(pilot, "output");
const manifest = JSON.parse(readFileSync(join(pilot, "scenes.json"), "utf8"));
const ffmpeg = "/opt/homebrew/bin/ffmpeg";
const ffprobe = "/opt/homebrew/bin/ffprobe";
const magick = "/opt/homebrew/bin/magick";
const say = "/usr/bin/say";
const font = "/System/Library/Fonts/SFNS.ttf";

for (const binary of [ffmpeg, ffprobe, magick, say]) {
  if (!existsSync(binary)) throw new Error(`Missing required binary: ${binary}`);
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(output, { recursive: true });

const run = (command, args, options = {}) => {
  console.log(`→ ${command.split("/").at(-1)} ${args.slice(0, 4).join(" ")}${args.length > 4 ? " …" : ""}`);
  execFileSync(command, args, { stdio: "inherit", ...options });
};

const probeDuration = (file) => Number(execFileSync(ffprobe, [
  "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
], { encoding: "utf8" }).trim());

const wrap = (text, limit) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const timecode = (seconds) => {
  const ms = Math.round(seconds * 1000);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const renderSceneOverlay = (scene, index, destination) => {
  const lines = wrap(scene.narration, 58);
  const captionHeight = lines.length * 42 + 58;
  const captionTop = 1000 - captionHeight;
  const args = [
    "-size", "1920x1080", "xc:none", "-font", font,
    "-fill", "rgba(2,9,18,0.42)", "-draw", "rectangle 0,0 1920,300",
    "-fill", "rgba(2,9,18,0.80)", "-draw", `roundrectangle 190,${captionTop} 1730,990 24,24`,
    "-fill", "#ff6b57", "-draw", "roundrectangle 92,72 98,106 3,3",
    "-gravity", "northwest", "-fill", "white", "-pointsize", "22", "-kerning", "4", "-annotate", "+118+72", "SIGNALFORGE · PILOT 01",
    "-gravity", "northeast", "-fill", "#d2e3ee", "-pointsize", "21", "-kerning", "0", "-annotate", "+92+72", `${String(index + 1).padStart(2, "0")} / ${String(manifest.scenes.length).padStart(2, "0")}`,
    "-gravity", "northwest", "-fill", "white", "-pointsize", "62", "-kerning", "1", "-annotate", "+92+142", scene.title,
    "-fill", "#ff8b79", "-pointsize", "25", "-kerning", "4", "-annotate", "+94+222", scene.stat,
    "-fill", "rgba(255,255,255,0.18)", "-draw", "rectangle 92,1012 1828,1014",
    "-gravity", "center", "-fill", "white", "-pointsize", "31", "-kerning", "0",
  ];
  const firstLineOffset = 350 - (lines.length - 1) * 21;
  for (const [lineIndex, line] of lines.entries()) {
    args.push("-annotate", `+0+${firstLineOffset + lineIndex * 42}`, line);
  }
  args.push(destination);
  run(magick, args);
};

const renderThumbnailOverlay = (destination) => {
  run(magick, [
    "-size", "1920x1080", "xc:none", "-font", font,
    "-fill", "rgba(2,9,18,0.18)", "-draw", "rectangle 0,0 1920,1080",
    "-fill", "rgba(2,9,18,0.82)", "-draw", "rectangle 0,0 1120,1080",
    "-fill", "#ff6b57", "-draw", "roundrectangle 112,172 120,244 4,4",
    "-gravity", "northwest", "-fill", "#ff8b79", "-pointsize", "30", "-kerning", "6", "-annotate", "+150+172", "THE CLOUD HAS A SEABED",
    "-fill", "white", "-pointsize", "112", "-kerning", "0", "-annotate", "+112+300", "WHY PUT",
    "-annotate", "+112+422", "864 SERVERS",
    "-annotate", "+112+544", "UNDERWATER?",
    "-fill", "#ff6b57", "-draw", "roundrectangle 112,714 820,790 38,38",
    "-fill", "#06111d", "-pointsize", "28", "-kerning", "3", "-annotate", "+148+728", "PROJECT NATICK · 2 YEARS",
    "-fill", "#d7e4ec", "-pointsize", "26", "-kerning", "5", "-annotate", "+112+920", "SIGNALFORGE · PILOT 01",
    destination,
  ]);
};

const sceneFiles = [];
const timings = [];
let cursor = 0;

for (const [index, scene] of manifest.scenes.entries()) {
  const asset = join(pilot, scene.asset);
  if (!existsSync(asset)) throw new Error(`Missing scene asset: ${asset}`);

  const narrationText = join(work, `${scene.id}-narration.txt`);
  const narrationAudio = join(work, `${scene.id}-narration.aiff`);
  const overlayPng = join(work, `${scene.id}-overlay.png`);
  const sceneVideo = join(work, `${scene.id}.mp4`);

  writeFileSync(narrationText, scene.narration);
  run(say, ["-v", manifest.voice, "-r", String(manifest.speechRate), "-f", narrationText, "-o", narrationAudio]);
  const narrationDuration = probeDuration(narrationAudio);
  const sceneDuration = narrationDuration + 1.0;

  renderSceneOverlay(scene, index, overlayPng);

  const zoomDirection = index % 2 === 0 ? "min(zoom+0.00035,1.08)" : "if(lte(zoom,1.0),1.08,max(1.0,zoom-0.00035))";
  const fadeOutStart = Math.max(0, sceneDuration - 0.35).toFixed(3);
  run(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "warning",
    "-loop", "1", "-framerate", "30", "-i", asset,
    "-i", narrationAudio,
    "-loop", "1", "-framerate", "30", "-i", overlayPng,
    "-filter_complex",
    `[0:v]scale=2048:1152:force_original_aspect_ratio=increase,crop=2048:1152,zoompan=z='${zoomDirection}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,setsar=1[bg];[bg][2:v]overlay=0:0:shortest=1,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutStart}:d=0.35,format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a:0",
    "-af", "highpass=f=70,lowpass=f=10000,aresample=48000:async=1:first_pts=0,adelay=250,apad=pad_dur=0.75",
    "-t", sceneDuration.toFixed(3),
    "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-profile:v", "high", "-level", "4.1",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", sceneVideo,
  ]);

  sceneFiles.push(sceneVideo);
  timings.push({ scene, start: cursor + 0.25, end: cursor + 0.25 + narrationDuration });
  cursor += sceneDuration;
}

const captions = timings.map(({ scene, start, end }, index) => [
  String(index + 1),
  `${timecode(start)} --> ${timecode(end)}`,
  scene.narration,
].join("\n")).join("\n\n") + "\n";
writeFileSync(join(output, "captions.srt"), captions);

const concatList = join(work, "scenes.txt");
writeFileSync(concatList, sceneFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
const assembled = join(work, "assembled.mp4");
run(ffmpeg, [
  "-y", "-hide_banner", "-loglevel", "warning", "-fflags", "+genpts",
  "-f", "concat", "-safe", "0", "-i", concatList,
  "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
  "-af", "aresample=48000:async=1:first_pts=0", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-avoid_negative_ts", "make_zero", assembled,
]);

const assembledDuration = probeDuration(assembled);
const ambient = join(work, "ambient.wav");
run(ffmpeg, [
  "-y", "-hide_banner", "-loglevel", "warning",
  "-f", "lavfi", "-i", `sine=frequency=48:sample_rate=48000:duration=${assembledDuration}`,
  "-f", "lavfi", "-i", `sine=frequency=96:sample_rate=48000:duration=${assembledDuration}`,
  "-f", "lavfi", "-i", `anoisesrc=color=brown:amplitude=0.018:sample_rate=48000:duration=${assembledDuration}`,
  "-filter_complex", `[0:a]volume=0.055[a0];[1:a]volume=0.018[a1];[2:a]lowpass=f=500,volume=0.55[a2];[a0][a1][a2]amix=inputs=3:duration=longest,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, assembledDuration - 3).toFixed(3)}:d=3[amb]`,
  "-map", "[amb]", "-c:a", "pcm_s16le", ambient,
]);

const finalVideo = join(output, "final-video.mp4");
run(ffmpeg, [
  "-y", "-hide_banner", "-loglevel", "warning", "-i", assembled, "-i", ambient,
  "-filter_complex", "[0:a]volume=1.0[narr];[1:a]volume=0.16[bed];[narr][bed]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:LRA=7:TP=-1.5[a]",
  "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", finalVideo,
]);

const thumbnailOverlayPng = join(work, "thumbnail-overlay.png");
const thumbnailBase = join(work, "thumbnail-base.png");
renderThumbnailOverlay(thumbnailOverlayPng);
run(magick, [join(pilot, manifest.scenes[0].asset), "-resize", "1920x1080^", "-gravity", "center", "-extent", "1920x1080", thumbnailBase]);
run(magick, [thumbnailBase, thumbnailOverlayPng, "-compose", "over", "-composite", join(output, "thumbnail.png")]);

const assetRights = {
  project: manifest.project,
  generatedAt: new Date().toISOString(),
  publishingApproved: false,
  assets: [
    ...Array.from(new Set(manifest.scenes.map((scene) => scene.asset))).map((path) => ({
      path,
      type: "AI-generated still image",
      provider: "OpenAI built-in image generation",
      externalCopyrightedMedia: false,
      humanReviewRequired: true,
    })),
    { path: "output/final-video.mp4#voice", type: "Synthetic narration", provider: `macOS system voice: ${manifest.voice}`, externalCopyrightedMedia: false, humanReviewRequired: true },
    { path: "output/final-video.mp4#music", type: "Procedurally synthesized ambient bed", provider: "FFmpeg lavfi", externalCopyrightedMedia: false, humanReviewRequired: false },
  ],
};
writeFileSync(join(output, "asset-rights.json"), JSON.stringify(assetRights, null, 2) + "\n");

const publishingMetadata = {
  title: "Why Microsoft Put 864 Servers Underwater",
  alternateTitles: ["The Cloud Has a Seabed", "Inside Microsoft's Underwater Data Center Experiment"],
  description: "A short, source-led documentary pilot about Microsoft Project Natick: 864 servers, two years on the seabed, and a failure rate one-eighth that of the land-based control group. This independent editorial pilot uses original narration and AI-generated illustrative visuals. Sources are included in the production package.",
  tags: ["Project Natick", "underwater data center", "Microsoft Research", "cloud computing", "technology documentary", "data centers"],
  syntheticMediaDisclosureRecommended: true,
  automaticPublishingAllowed: false,
};
writeFileSync(join(output, "title-description-tags.json"), JSON.stringify(publishingMetadata, null, 2) + "\n");
copyFileSync(join(pilot, "sources.json"), join(output, "sources.json"));

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const finalDuration = probeDuration(finalVideo);
const report = {
  project: manifest.project,
  title: manifest.title,
  generatedAt: new Date().toISOString(),
  durationSeconds: Number(finalDuration.toFixed(3)),
  resolution: "1920x1080",
  frameRate: 30,
  videoCodec: "H.264",
  audioCodec: "AAC",
  targetLoudness: "-16 LUFS (one-pass normalization)",
  sceneCount: manifest.scenes.length,
  sourceCount: JSON.parse(readFileSync(join(pilot, "sources.json"), "utf8")).sources.length,
  narration: { voice: manifest.voice, rate: manifest.speechRate, originalScript: true },
  captions: { sidecar: "captions.srt", burnedIn: true },
  visuals: { generatedStillImages: new Set(manifest.scenes.map((scene) => scene.asset)).size, motion: "deterministic Ken Burns movement and editorial overlays" },
  checks: {
    requiredOutputsPresent: true,
    durationWithinPilotContract: finalDuration >= 60 && finalDuration <= 90,
    noAutomaticPublishing: true,
    humanReviewRequired: true,
  },
  sha256: {
    video: sha256(finalVideo),
    thumbnail: sha256(join(output, "thumbnail.png")),
    captions: sha256(join(output, "captions.srt")),
  },
};
writeFileSync(join(output, "production-report.json"), JSON.stringify(report, null, 2) + "\n");

rmSync(work, { recursive: true, force: true });

console.log(`\nPilot rendered: ${finalVideo}`);
console.log(`Duration: ${finalDuration.toFixed(2)}s`);
console.log(`Contract: ${report.checks.durationWithinPilotContract ? "PASS" : "FAIL (must be 60–90s)"}`);
if (!report.checks.durationWithinPilotContract) process.exitCode = 1;
