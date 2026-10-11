// Production worker: runs queued jobs outside the web process (heavy media work never blocks requests).
// Every job ends in ready_for_review; only the owner can move it to completed.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { claims, productionJobs, sources, videos } from "@shared/schema";
import { config } from "./config";
import { MINIMUM_VERIFIED_SOURCES, aiProviderStatus, stageStatus, type ProductionStage } from "./ai-workflow";
import { planVisuals, sectionsFromScript, writeEpisode, type ScenePlan, type VisualPlan } from "./editorial";
import { synthesizeNarration } from "./providers/elevenlabs";
import { findStockClip } from "./providers/pexels";
import { renderEpisode, type SceneAudio, type SceneVisual } from "./media/render";

if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for the worker");
const client = postgres(config.DATABASE_URL, { max: 3, idle_timeout: 20 });
const db = drizzle(client);
const mediaRoot = resolve(config.MEDIA_DIR);

type Job = typeof productionJobs.$inferSelect;

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", event, at: new Date().toISOString(), ...fields }));

const videoDir = (videoId: string, ...parts: string[]) => {
  const dir = join(mediaRoot, "videos", videoId, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
};

async function progress(job: Job, value: number) {
  await db.update(productionJobs).set({ progress: value, updatedAt: new Date() }).where(eq(productionJobs.id, job.id));
}

async function latestCompleted(videoId: string, kind: string) {
  return (await db.select().from(productionJobs)
    .where(and(eq(productionJobs.videoId, videoId), eq(productionJobs.kind, kind), eq(productionJobs.status, "completed")))
    .orderBy(sql`${productionJobs.updatedAt} desc`).limit(1))[0];
}

async function loadVideo(videoId: string) {
  const video = (await db.select().from(videos).where(eq(videos.id, videoId)).limit(1))[0];
  if (!video) throw new Error("Video no longer exists");
  return video;
}

const verifiedSources = (videoId: string) => db.select().from(sources).where(and(eq(sources.videoId, videoId), eq(sources.verified, true)));

async function runResearch(job: Job) {
  const video = await loadVideo(job.videoId);
  const sourceRows = await verifiedSources(job.videoId);
  if (sourceRows.length < MINIMUM_VERIFIED_SOURCES) throw new Error(`Needs ${MINIMUM_VERIFIED_SOURCES} verified sources, has ${sourceRows.length}`);
  const claimRows = (await db.select().from(claims).where(eq(claims.videoId, job.videoId))).filter((claim) => claim.status === "supported");
  if (claimRows.length < 3) throw new Error(`Needs at least 3 supported claims, has ${claimRows.length}`);
  await progress(job, 35);
  const { dossier, assessment } = await writeEpisode(video, sourceRows, claimRows);
  return { dossier, quality: { wordCount: assessment.wordCount, hooks: assessment.hooks, titles: assessment.titles, problems: assessment.problems } };
}

async function runVisualPlan(job: Job) {
  const video = await loadVideo(job.videoId);
  if (!video.script) throw new Error("Video has no approved script");
  const plan = await planVisuals(video.title, sectionsFromScript(video.script));
  await progress(job, 40);
  const stockDir = videoDir(job.videoId, "stock");
  const used = new Set<number>();
  const visuals: SceneVisual[] = [];
  // Reuse a clip for consecutive scenes with the same query so cuts follow the narration, not every sentence.
  const byQuery = new Map<string, SceneVisual>();
  for (const scene of plan.scenes) {
    const cached = byQuery.get(scene.query.toLowerCase());
    if (cached) {
      visuals.push({ ...cached, index: scene.index });
      continue;
    }
    const clip = await findStockClip(scene.query, stockDir, used, 10).catch((error) => {
      log("stock_lookup_failed", { jobId: job.id, query: scene.query, message: error instanceof Error ? error.message : String(error) });
      return null;
    });
    const visual: SceneVisual = clip
      ? { index: scene.index, kind: "stock", file: clip.file, credit: { pexelsId: clip.pexelsId, url: clip.url, author: clip.author } }
      : { index: scene.index, kind: "card" };
    if (clip) used.add(clip.pexelsId);
    byQuery.set(scene.query.toLowerCase(), visual);
    visuals.push(visual);
    await progress(job, 40 + Math.round((scene.index / plan.scenes.length) * 50));
  }
  const thumbClip = await findStockClip(plan.thumbnail.query, stockDir, new Set(), 3).catch(() => null);
  const thumbnailVisual: SceneVisual | undefined = thumbClip ? { index: -1, kind: "stock", file: thumbClip.file, credit: { pexelsId: thumbClip.pexelsId, url: thumbClip.url, author: thumbClip.author } } : undefined;
  return { plan, visuals, thumbnailVisual, stockScenes: visuals.filter((visual) => visual.kind === "stock").length };
}

async function runVoiceover(job: Job) {
  const planJob = await latestCompleted(job.videoId, "visual_plan");
  const plan = planJob?.output.plan as VisualPlan | undefined;
  if (!plan?.scenes.length) throw new Error("Approved visual plan is required");
  const dir = videoDir(job.videoId, `voice-${job.id}`);
  const audio: SceneAudio[] = [];
  let characters = 0;
  for (const scene of plan.scenes) {
    const narration = await synthesizeNarration(scene.narration, join(dir, `scene-${String(scene.index).padStart(3, "0")}`), plan.scenes[scene.index - 1]?.narration);
    audio.push({ index: scene.index, ...narration });
    characters += scene.narration.length;
    await progress(job, 10 + Math.round(((scene.index + 1) / plan.scenes.length) * 85));
  }
  const durationSeconds = Number(audio.reduce((sum, item) => sum + item.duration, 0).toFixed(1));
  return { audio, characters, durationSeconds, provider: audio[0]?.provider };
}

async function runRender(job: Job) {
  const video = await loadVideo(job.videoId);
  const planJob = await latestCompleted(job.videoId, "visual_plan");
  const voiceJob = await latestCompleted(job.videoId, "voiceover");
  const research = await latestCompleted(job.videoId, "editorial_research");
  const plan = planJob?.output.plan as VisualPlan | undefined;
  const visuals = (planJob?.output.visuals as SceneVisual[] | undefined) ?? [];
  const audio = voiceJob?.output.audio as SceneAudio[] | undefined;
  if (!plan || !audio) throw new Error("Approved visual plan and voiceover are required");
  const dossier = research?.output.dossier as { description?: string; tags?: string[] } | undefined;
  const titles = (research?.output.quality as { titles?: { title: string }[] } | undefined)?.titles;
  const sourceRows = await verifiedSources(job.videoId);
  const outputDir = videoDir(job.videoId, `render-${job.id}`);
  await progress(job, 15);
  const report = renderEpisode({
    outputDir,
    title: titles?.[0]?.title ?? video.title,
    channel: config.CHANNEL_NAME,
    scenes: plan.scenes as ScenePlan[],
    audio,
    visuals,
    shorts: plan.shorts,
    thumbnail: { text: plan.thumbnail.text, visual: planJob?.output.thumbnailVisual as SceneVisual | undefined },
    metadata: { description: dossier?.description ?? "", tags: dossier?.tags ?? [] },
    sources: sourceRows.map((source) => ({ title: source.title, url: source.url, publisher: source.publisher })),
  });
  return { outputDir, report, files: ["final-video.mp4", "thumbnail.png", "captions.srt", "title-description-tags.json", "sources.json", "asset-rights.json", "production-report.json", ...report.shorts.map((short) => short.file)] };
}

const runners: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
  editorial_research: runResearch,
  visual_plan: runVisualPlan,
  voiceover: runVoiceover,
  render: runRender,
};

async function claimNextJob(): Promise<Job | undefined> {
  const rows = await client<Job[]>`
    update production_jobs set status = 'running', progress = greatest(progress, 15), error = null, updated_at = now()
    where id = (select id from production_jobs where status = 'queued' order by created_at limit 1 for update skip locked)
    returning id`;
  if (!rows[0]) return undefined;
  return (await db.select().from(productionJobs).where(eq(productionJobs.id, rows[0].id)).limit(1))[0];
}

// Jobs created before a key, a source or an approval existed move forward on their own once the gate opens.
async function promoteWaitingJobs() {
  const waiting = await db.select().from(productionJobs)
    .where(inArray(productionJobs.status, ["waiting_for_provider", "waiting_for_sources", "waiting_for_script", "waiting_for_prerequisites"]))
    .orderBy(asc(productionJobs.createdAt));
  for (const job of waiting) {
    const video = (await db.select().from(videos).where(eq(videos.id, job.videoId)).limit(1))[0];
    if (!video) continue;
    let next: string;
    if (job.kind === "editorial_research") {
      const count = (await verifiedSources(job.videoId)).length;
      next = count < MINIMUM_VERIFIED_SOURCES ? "waiting_for_sources" : aiProviderStatus().configured ? "queued" : "waiting_for_provider";
    } else if (job.kind in runners) {
      const completed = (await db.select({ kind: productionJobs.kind }).from(productionJobs)
        .where(and(eq(productionJobs.videoId, job.videoId), eq(productionJobs.status, "completed")))).map((row) => row.kind);
      next = stageStatus(job.kind as ProductionStage, Boolean(video.script), completed).status;
    } else continue;
    if (next !== job.status) {
      await db.update(productionJobs).set({ status: next, progress: next === "queued" ? 10 : job.progress, updatedAt: new Date() }).where(eq(productionJobs.id, job.id));
      log("job_promoted", { jobId: job.id, kind: job.kind, from: job.status, to: next });
    }
  }
}

async function processJob(job: Job) {
  const started = Date.now();
  log("job_started", { jobId: job.id, kind: job.kind, videoId: job.videoId });
  try {
    const runner = runners[job.kind];
    if (!runner) throw new Error(`No runner for job kind ${job.kind}`);
    const output = await runner(job);
    await db.update(productionJobs).set({
      status: "ready_for_review", progress: 95, output: { ...output, producedAt: new Date().toISOString() }, error: null, updatedAt: new Date(),
    }).where(eq(productionJobs.id, job.id));
    log("job_ready_for_review", { jobId: job.id, kind: job.kind, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(productionJobs).set({ status: "failed", error: message.slice(0, 2000), updatedAt: new Date() }).where(eq(productionJobs.id, job.id));
    console.error(JSON.stringify({ level: "error", event: "job_failed", jobId: job.id, kind: job.kind, message }));
  }
}

let stopping = false;

export async function runWorkerOnce() {
  await promoteWaitingJobs();
  let processed = 0;
  for (let job = await claimNextJob(); job && !stopping; job = await claimNextJob()) {
    await processJob(job);
    processed += 1;
  }
  return processed;
}

async function main() {
  // A crash mid-job leaves it "running"; nothing else can be running when the single worker starts.
  const recovered = await client`update production_jobs set status = 'queued', updated_at = now() where status = 'running' returning id`;
  if (recovered.length) log("jobs_recovered", { count: recovered.length });
  log("worker_started", { mediaRoot, poll: config.WORKER_POLL_SECONDS, ...aiProviderStatus() });
  const once = process.argv.includes("--once");
  do {
    await runWorkerOnce().catch((error) => console.error(JSON.stringify({ level: "error", event: "worker_cycle_failed", message: error instanceof Error ? error.message : String(error) })));
    if (once || stopping) break;
    await new Promise((done) => setTimeout(done, config.WORKER_POLL_SECONDS * 1000));
  } while (!stopping);
  await client.end({ timeout: 5 });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { stopping = true; log("worker_stopping", { signal }); });

main().catch((error) => {
  console.error(JSON.stringify({ level: "error", event: "worker_crashed", message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
