import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { productionJobs, sources, videos } from "@shared/schema";
import { config } from "./config";

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
    configured: Boolean(config.OPENAI_API_KEY),
    model: config.OPENAI_MODEL,
    endpoint: "Responses API",
    structuredOutputs: true,
    execution: config.OPENAI_API_KEY ? "adapter_activation_required" : "waiting_for_provider",
  };
}

export async function queueEditorialResearch(videoId: string) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  const video = (await db.select().from(videos).where(eq(videos.id, videoId)).limit(1))[0];
  if (!video) return null;
  const provider = aiProviderStatus();
  const verifiedSourceCount = (await db.select({ id: sources.id }).from(sources).where(and(eq(sources.videoId, videoId), eq(sources.verified, true)))).length;
  const status = verifiedSourceCount < 5 ? "waiting_for_sources" : provider.configured ? "provider_activation_required" : "waiting_for_provider";
  const job = (await db.insert(productionJobs).values({
    videoId,
    kind: "editorial_research",
    provider: "openai",
    status,
    progress: 5,
    input: {
      title: video.title,
      niche: video.niche,
      originalityFloor: 85,
      minimumIndependentSources: 5,
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

const productionProviders = {
  voiceover: { env: "ELEVENLABS_API_KEY", provider: "elevenlabs" },
  visual_plan: { env: "OPENAI_API_KEY", provider: "openai" },
  render: { env: "RENDER_PROVIDER_API_KEY", provider: "render_adapter" },
} as const;

export async function queueProductionStage(videoId: string, kind: keyof typeof productionProviders) {
  if (!db) throw new Error("DATABASE_URL is required for production jobs");
  const video = (await db.select().from(videos).where(eq(videos.id, videoId)).limit(1))[0];
  if (!video) return null;
  const previous = await db.select().from(productionJobs).where(eq(productionJobs.videoId, videoId));
  const provider = productionProviders[kind];
  const prerequisites = kind === "render"
    ? ["voiceover", "visual_plan"].filter((required) => !previous.some((job) => job.kind === required && job.status === "completed"))
    : [];
  const status = !video.script && kind !== "visual_plan"
    ? "waiting_for_script"
    : prerequisites.length
      ? "waiting_for_prerequisites"
      : process.env[provider.env]
        ? "queued"
        : "waiting_for_provider";
  return (await db.insert(productionJobs).values({
    videoId,
    kind,
    provider: provider.provider,
    status,
    progress: status === "queued" ? 10 : 0,
    input: {
      title: video.title,
      scriptVersion: video.updatedAt.toISOString(),
      prerequisites,
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
    output: { reviewedByOwner: true, note },
    updatedAt: new Date(),
  }).where(eq(productionJobs.id, jobId)).returning())[0];
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
