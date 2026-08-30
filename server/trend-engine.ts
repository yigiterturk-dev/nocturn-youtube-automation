import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { opportunities, trendSnapshots, trendWatchlists } from "@shared/schema";
import type { InsertTrendWatchlist } from "@shared/schema";
import { buildTrendCandidate, discoverYouTubeCandidates } from "./youtube";
import { config } from "./config";

const client = config.DATABASE_URL ? postgres(config.DATABASE_URL, { max: 5, idle_timeout: 20 }) : null;
const db = client ? drizzle(client) : null;
const database = () => {
  if (!db) throw new Error("DATABASE_URL is required for trend intelligence");
  return db;
};

export async function listTrendWatchlists(workspaceId: string) {
  return database().select().from(trendWatchlists).where(eq(trendWatchlists.workspaceId, workspaceId)).orderBy(desc(trendWatchlists.createdAt));
}

export async function createTrendWatchlist(value: InsertTrendWatchlist) {
  return (await database().insert(trendWatchlists).values(value).returning())[0];
}

export async function scanTrendWatchlist(workspaceId: string, watchlistId?: string) {
  const d = database();
  const watchlists = await listTrendWatchlists(workspaceId);
  const selected = watchlistId ? watchlists.find((item) => item.id === watchlistId) : watchlists.find((item) => item.active);
  const discovered = await discoverYouTubeCandidates(selected ? {
    queries: selected.queries,
    region: selected.region,
    categoryId: selected.categoryId,
  } : undefined);
  const stored = [];
  for (const raw of discovered) {
    const externalId = `youtube:${raw.video.id}`;
    const existing = (await d.select().from(opportunities).where(eq(opportunities.externalId, externalId)).limit(1))[0];
    const previous = existing
      ? (await d.select().from(trendSnapshots).where(eq(trendSnapshots.opportunityId, existing.id)).orderBy(desc(trendSnapshots.capturedAt)).limit(1))[0]
      : undefined;
    const candidate = buildTrendCandidate(raw, previous ? {
      views: previous.views,
      viewsPerHour: previous.viewsPerHour,
      capturedAt: previous.capturedAt,
    } : undefined);
    const opportunity = (await d.insert(opportunities).values({
      workspaceId,
      externalId: candidate.externalId,
      topic: candidate.topic,
      niche: candidate.niche,
      signal: candidate.signal,
      velocity: candidate.velocity,
      opportunity: candidate.opportunity,
      competition: candidate.competition,
      shelfLife: candidate.shelfLife,
      sourceCount: candidate.sourceCount,
      raw: candidate.raw,
    }).onConflictDoUpdate({
      target: opportunities.externalId,
      set: {
        topic: candidate.topic,
        niche: candidate.niche,
        signal: candidate.signal,
        velocity: candidate.velocity,
        opportunity: candidate.opportunity,
        competition: candidate.competition,
        shelfLife: candidate.shelfLife,
        sourceCount: candidate.sourceCount,
        raw: candidate.raw,
        updatedAt: new Date(),
      },
    }).returning())[0];
    await d.insert(trendSnapshots).values({ opportunityId: opportunity.id, ...candidate.snapshot });
    stored.push(opportunity);
  }
  return {
    watchlist: selected || null,
    discovered: discovered.length,
    insertedOrUpdated: stored.length,
    opportunities: stored.sort((a, b) => b.opportunity - a.opportunity),
  };
}

export async function trendEngineStatus(workspaceId: string) {
  const d = database();
  const watchlists = await listTrendWatchlists(workspaceId);
  const snapshots = await d.select().from(trendSnapshots).orderBy(desc(trendSnapshots.capturedAt)).limit(1);
  return {
    version: "2.0",
    scoring: ["demand", "channel_outlier", "engagement", "freshness", "acceleration", "cross_signal", "confidence"],
    deduplication: "youtube_video_id_upsert",
    historicalSnapshots: true,
    watchlists: watchlists.length,
    lastSnapshotAt: snapshots[0]?.capturedAt || null,
    scheduler: {
      enabled: Boolean(process.env.YOUTUBE_API_KEY),
      intervalMinutes: Number(process.env.TREND_AUTOSCAN_MINUTES || 120),
    },
  };
}

let scheduledScanRunning = false;
export async function runScheduledTrendScans() {
  if (!process.env.YOUTUBE_API_KEY || scheduledScanRunning) return;
  scheduledScanRunning = true;
  try {
    const active = await database().select().from(trendWatchlists).where(eq(trendWatchlists.active, true));
    for (const watchlist of active) await scanTrendWatchlist(watchlist.workspaceId, watchlist.id);
  } finally {
    scheduledScanRunning = false;
  }
}
