import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { productionJobs, sources, videos } from "@shared/schema";
import { config } from "./config";
import { narrationProviderReady } from "./providers/elevenlabs";
import { scriptFromSections, type ScriptSection } from "./editorial";

const client = config.DATABASE_URL ? postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20 }) : null;
const db = client ? drizzle(client) : null;

export const editorialOutputContract = {
  version: "1.0",
  required: ["angle", "viewerPromise", "sourcePlan", "claims", "outline", "script", "riskFlags"],
  rules: [
    "Synthesize multiple sources; do not paraphrase one source.",
    "Separate verified claims, inference, and creative wording.",
    "Every factual claim must point to source IDs.",
    "Do not fabricate names, dates, metrics, quotes, or events.",
    "Stop before publishing; human editorial approval is mandatory.",
  ],
};

export function aiProviderStatus() {
  return {
    configured: Boolean(config.DEEPSEEK_API_KEY),
    model: config.DEEPSEEK_MODEL,
    endpoint: "DeepSeek chat completions (JSON mode)",
    structuredOutputs: true,
    execution: config.DEEPSEEK_API_KEY ? "worker" : "waiting_for_provider",
    voice: config.ELEVENLABS_API_KEY ? "elevenlabs" : narrationProviderReady() ? "local_development_tts" : "waiting_for_provider",
    stockFootage: config.PEXELS_API_KEY ? "pexels" : "generated_cards",
  };
}

export const MINIMUM_VERIFIED_SOURCES = 5;

export async function queueEditorialResearch(videoId: string) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  const video = (await db.select().from(videos).where(eq(videos.id, videoId)).limit(1))[0];
  if (!video) return null;
  const provider = aiProviderStatus();
  const verifiedSourceCount = (await db.select({ id: sources.id }).from(sources).where(and(eq(sources.videoId, videoId), eq(sources.verified, true)))).length;
  const status = verifiedSourceCount < MINIMUM_VERIFIED_SOURCES ? "waiting_for_sources" : provider.configured ? "queued" : "waiting_for_provider";
  const job = (await db.insert(productionJobs).values({
    videoId,
    kind: "editorial_research",
    provider: "deepseek",
    status,
    progress: status === "queued" ? 10 : 5,
    input: {
      title: video.title,
      niche: video.niche,
      originalityFloor: 85,
      minimumIndependentSources: MINIMUM_VERIFIED_SOURCES,
      verifiedSourceCount,
      outputContract: editorialOutputContract,
      promptContract: {
        role: "Evidence-led YouTube editorial researcher and script architect",
        goal: "Develop an original, sourced episode dossier and narration script.",
        success: "All material claims are traceable; angle is meaningfully distinct; risk flags are explicit.",
        stop: "Do not invent missing evidence and do not approve publishing.",
      },
    },
    output: {},
  }).returning())[0];
  return job;
}

export async function listProductionJobs(videoId?: string) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  if (videoId) return db.select().from(productionJobs).where(eq(productionJobs.videoId, videoId)).orderBy(desc(productionJobs.createdAt));
  return db.select().from(productionJobs).orderBy(desc(productionJobs.createdAt)).limit(100);
}

export const productionStages = {
  visual_plan: { provider: "deepseek", requires: [] as string[], ready: () => Boolean(config.DEEPSEEK_API_KEY) },
  voiceover: { provider: "elevenlabs", requires: ["visual_plan"], ready: narrationProviderReady },
  render: { provider: "local_ffmpeg", requires: ["visual_plan", "voiceover"], ready: () => true },
} as const;
export type ProductionStage = keyof typeof productionStages;

// One place decides whether a stage may run, so the API and the worker never disagree.
export function stageStatus(kind: ProductionStage, hasScript: boolean, completedKinds: string[]) {
  const stage = productionStages[kind];
  const missing = stage.requires.filter((required) => !completedKinds.includes(required));
  if (!hasScript) return { status: "waiting_for_script", missing };
  if (missing.length) return { status: "waiting_for_prerequisites", missing };
  return { status: stage.ready() ? "queued" : "waiting_for_provider", missing };
}

export async function queueProductionStage(videoId: string, kind: ProductionStage) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  const video = (await db.select().from(videos).where(eq(videos.id, videoId)).limit(1))[0];
  if (!video) return null;
  const previous = await db.select().from(productionJobs).where(eq(productionJobs.videoId, videoId));
  const { status, missing } = stageStatus(kind, Boolean(video.script), previous.filter((job) => job.status === "completed").map((job) => job.kind));
  return (await db.insert(productionJobs).values({
    videoId,
    kind,
    provider: productionStages[kind].provider,
    status,
    progress: status === "queued" ? 10 : 0,
    input: {
      title: video.title,
      scriptVersion: video.updatedAt.toISOString(),
      prerequisites: missing,
      humanReviewRequired: true,
    },
    output: {},
  }).returning())[0];
}

export async function reviewProductionJob(jobId: string, status: "completed" | "rejected", note: string) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  const current = (await db.select().from(productionJobs).where(eq(productionJobs.id, jobId)).limit(1))[0];
  if (!current) return null;
  if (status === "completed" && current.status !== "ready_for_review") {
    return { blocked: true as const, reason: "Only a provider-produced artifact in ready_for_review can be completed" };
  }
  const job = (await db.update(productionJobs).set({
    status,
    progress: status === "completed" ? 100 : 0,
    output: { ...current.output, review: { reviewedByOwner: true, status, note, at: new Date().toISOString() } },
    updatedAt: new Date(),
  }).where(eq(productionJobs.id, jobId)).returning())[0];
  // An accepted editorial dossier becomes the episode script that every later stage reads.
  if (status === "completed" && current.kind === "editorial_research") {
    const dossier = current.output.dossier as { sections?: ScriptSection[]; titles?: { title: string }[] } | undefined;
    if (dossier?.sections?.length) {
      await db.update(videos).set({ script: scriptFromSections(dossier.sections), updatedAt: new Date() }).where(eq(videos.id, current.videoId));
    }
  }
  return { blocked: false as const, job };
}

export async function setPublishApproval(videoId: string, approved: boolean, note: string) {
  if (!db) throw new Error("DATABASE_URL is required for publishing approval");
  if (approved) {
    const completedRender = (await db.select({ id: productionJobs.id }).from(productionJobs)
      .where(and(eq(productionJobs.videoId, videoId), eq(productionJobs.kind, "render"), eq(productionJobs.status, "completed"))).limit(1))[0];
    if (!completedRender) return { blocked: true as const, reason: "A completed, owner-reviewed render is required" };
  }
  const video = (await db.update(videos).set({
    publishApproved: approved,
    status: approved ? "Approved for publishing" : "Ready to publish",
    updatedAt: new Date(),
  }).where(eq(videos.id, videoId)).returning())[0];
  if (!video) return null;
  return { blocked: false as const, video, note };
}

export async function getProductionJob(jobId: string) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  return (await db.select().from(productionJobs).where(eq(productionJobs.id, jobId)).limit(1))[0];
}
