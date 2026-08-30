import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  activity, claims, opportunities, sources, videos,
  type Activity, type Claim, type InsertClaim, type InsertOpportunity, type InsertSource, type InsertVideo, type Opportunity, type Source, type Video,
} from "@shared/schema";

export interface IStorage {
  getOpportunities(): Promise<Opportunity[]>;
  createOpportunity(value: InsertOpportunity): Promise<Opportunity>;
  getVideos(): Promise<Video[]>;
  createVideo(value: InsertVideo): Promise<Video>;
  updateVideo(id: string, status: string, progress: number): Promise<Video | undefined>;
  getSources(videoId: string): Promise<Source[]>;
  createSource(value: InsertSource): Promise<Source>;
  verifySource(id: string, videoId: string, verified: boolean): Promise<Source | undefined>;
  getClaims(videoId: string): Promise<Claim[]>;
  createClaim(value: InsertClaim): Promise<Claim>;
  verifyClaim(id: string, videoId: string, sourceId: string, status: "supported" | "conflicted", evidenceExcerpt: string, confidence: number): Promise<Claim | undefined>;
  getActivity(): Promise<Activity[]>;
  health(): Promise<{ driver: "memory" | "postgres"; healthy: boolean }>;
}

const now = () => new Date();
const opportunitySeed: Opportunity[] = [
  { id: "op-1", workspaceId: null, externalId: null, topic: "Why data centers are moving underwater", niche: "Future tech", signal: "Outlier ×8.4", velocity: 184, opportunity: 92, competition: "Medium", shelfLife: "14–30 days", sourceCount: 11, raw: {}, createdAt: now(), updatedAt: now() },
  { id: "op-2", workspaceId: null, externalId: null, topic: "The hidden economy of abandoned satellites", niche: "Space economy", signal: "Search breakout", velocity: 133, opportunity: 88, competition: "Low", shelfLife: "Evergreen", sourceCount: 9, raw: {}, createdAt: now(), updatedAt: now() },
  { id: "op-3", workspaceId: null, externalId: null, topic: "How supermarkets design your decisions", niche: "Behavior science", signal: "Cross-platform", velocity: 96, opportunity: 84, competition: "Low", shelfLife: "Evergreen", sourceCount: 14, raw: {}, createdAt: now(), updatedAt: now() },
  { id: "op-4", workspaceId: null, externalId: null, topic: "The race for solid-state batteries", niche: "Energy", signal: "News cluster", velocity: 78, opportunity: 79, competition: "High", shelfLife: "7–14 days", sourceCount: 18, raw: {}, createdAt: now(), updatedAt: now() },
];
const videoSeed: Video[] = [
  { id: "vid-1", workspaceId: null, channelId: null, opportunityId: null, title: "The Ocean Is Becoming a Data Center", niche: "Future tech", status: "Editorial review", progress: 72, owner: "Editorial", due: "Today, 18:00", originality: 94, sourceCount: 12, script: null, youtubeVideoId: null, publishApproved: false, createdAt: now(), updatedAt: now() },
  { id: "vid-2", workspaceId: null, channelId: null, opportunityId: null, title: "There Are Millions in Dead Satellites", niche: "Space economy", status: "Script", progress: 46, owner: "AI writer", due: "Tomorrow", originality: 89, sourceCount: 9, script: null, youtubeVideoId: null, publishApproved: false, createdAt: now(), updatedAt: now() },
  { id: "vid-3", workspaceId: null, channelId: null, opportunityId: null, title: "The Supermarket Knows Your Next Move", niche: "Behavior science", status: "Visual production", progress: 61, owner: "Production", due: "Thu, 14:00", originality: 96, sourceCount: 14, script: null, youtubeVideoId: null, publishApproved: false, createdAt: now(), updatedAt: now() },
  { id: "vid-4", workspaceId: null, channelId: null, opportunityId: null, title: "The Battery That Could Reset the Car Market", niche: "Energy", status: "Research", progress: 24, owner: "Research", due: "Fri, 12:00", originality: 81, sourceCount: 6, script: null, youtubeVideoId: null, publishApproved: false, createdAt: now(), updatedAt: now() },
];

export class MemStorage implements IStorage {
  private opportunities = [...opportunitySeed];
  private videos = [...videoSeed];
  private activity: Activity[] = [
    { id: "act-1", workspaceId: null, message: "Originality check passed for Ocean Data Center", kind: "pass", createdAt: new Date(Date.now() - 12 * 60_000) },
    { id: "act-2", workspaceId: null, message: "3 new source claims need editorial review", kind: "warning", createdAt: new Date(Date.now() - 31 * 60_000) },
    { id: "act-3", workspaceId: null, message: "Trend radar completed 248 topic scans", kind: "signal", createdAt: new Date(Date.now() - 52 * 60_000) },
  ];
  private sources: Source[] = [];
  private claims: Claim[] = [];
  async getOpportunities() { return this.opportunities.sort((a, b) => b.opportunity - a.opportunity); }
  async createOpportunity(value: InsertOpportunity) {
    const item: Opportunity = { workspaceId: null, externalId: null, raw: {}, ...value, id: randomUUID(), createdAt: now(), updatedAt: now() };
    this.opportunities.unshift(item); return item;
  }
  async getVideos() { return this.videos; }
  async createVideo(value: InsertVideo) {
    const item: Video = { workspaceId: null, channelId: null, opportunityId: null, script: null, youtubeVideoId: null, publishApproved: false, ...value, id: randomUUID(), createdAt: now(), updatedAt: now() };
    this.videos.unshift(item);
    this.activity.unshift({ id: randomUUID(), workspaceId: null, message: `${item.title} production pipeline created`, kind: "signal", createdAt: now() });
    return item;
  }
  async updateVideo(id: string, status: string, progress: number) {
    const item = this.videos.find((video) => video.id === id); if (!item) return undefined;
    item.status = status; item.progress = progress; item.updatedAt = now();
    this.activity.unshift({ id: randomUUID(), workspaceId: null, message: `${item.title} moved to ${status}`, kind: "pass", createdAt: now() });
    return item;
  }
  async getSources(videoId: string) { return this.sources.filter((item) => item.videoId === videoId); }
  async createSource(value: InsertSource) {
    const item: Source = { ...value, publisher: value.publisher ?? null, id: randomUUID(), claimCount: 0, verified: false, createdAt: now(), updatedAt: now() };
    this.sources.unshift(item);
    const video = this.videos.find((candidate) => candidate.id === value.videoId);
    if (video) video.sourceCount = this.sources.filter((candidate) => candidate.videoId === value.videoId).length;
    return item;
  }
  async verifySource(id: string, videoId: string, verified: boolean) {
    const item = this.sources.find((candidate) => candidate.id === id && candidate.videoId === videoId);
    if (!item) return undefined;
    item.verified = verified; item.updatedAt = now(); return item;
  }
  async getClaims(videoId: string) { return this.claims.filter((item) => item.videoId === videoId); }
  async createClaim(value: InsertClaim) {
    const item: Claim = { ...value, sourceId: value.sourceId ?? null, id: randomUUID(), status: "unverified", evidenceExcerpt: null, confidence: 0, createdAt: now(), updatedAt: now() };
    this.claims.unshift(item); return item;
  }
  async verifyClaim(id: string, videoId: string, sourceId: string, status: "supported" | "conflicted", evidenceExcerpt: string, confidence: number) {
    const item = this.claims.find((candidate) => candidate.id === id && candidate.videoId === videoId);
    const source = this.sources.find((candidate) => candidate.id === sourceId && candidate.videoId === videoId);
    if (!item || !source) return undefined;
    item.sourceId = sourceId; item.status = status; item.evidenceExcerpt = evidenceExcerpt; item.confidence = confidence; item.updatedAt = now();
    source.claimCount = this.claims.filter((candidate) => candidate.sourceId === sourceId && candidate.status !== "unverified").length;
    return item;
  }
  async getActivity() { return this.activity.slice(0, 8); }
  async health() { return { driver: "memory" as const, healthy: true }; }
}

export class PostgresStorage implements IStorage {
  private client;
  private db;
  constructor(url: string) {
    this.client = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
    this.db = drizzle(this.client);
  }
  async getOpportunities() { return this.db.select().from(opportunities).orderBy(desc(opportunities.opportunity)).limit(100); }
  async createOpportunity(value: InsertOpportunity) { return (await this.db.insert(opportunities).values(value).returning())[0]; }
  async getVideos() { return this.db.select().from(videos).orderBy(desc(videos.createdAt)).limit(100); }
  async createVideo(value: InsertVideo) {
    const item = (await this.db.insert(videos).values(value).returning())[0];
    await this.db.insert(activity).values({ message: `${item.title} production pipeline created`, kind: "signal" });
    return item;
  }
  async updateVideo(id: string, status: string, progress: number) {
    const item = (await this.db.update(videos).set({ status, progress, updatedAt: now() }).where(eq(videos.id, id)).returning())[0];
    if (item) await this.db.insert(activity).values({ message: `${item.title} moved to ${status}`, kind: "pass" });
    return item;
  }
  async getSources(videoId: string) { return this.db.select().from(sources).where(eq(sources.videoId, videoId)).orderBy(desc(sources.createdAt)); }
  async createSource(value: InsertSource) {
    const item = (await this.db.insert(sources).values(value).returning())[0];
    const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(sources).where(eq(sources.videoId, value.videoId));
    await this.db.update(videos).set({ sourceCount: result[0]?.count ?? 0, updatedAt: now() }).where(eq(videos.id, value.videoId));
    return item;
  }
  async verifySource(id: string, videoId: string, verified: boolean) {
    return (await this.db.update(sources).set({ verified, updatedAt: now() }).where(and(eq(sources.id, id), eq(sources.videoId, videoId))).returning())[0];
  }
  async getClaims(videoId: string) { return this.db.select().from(claims).where(eq(claims.videoId, videoId)).orderBy(desc(claims.createdAt)); }
  async createClaim(value: InsertClaim) { return (await this.db.insert(claims).values(value).returning())[0]; }
  async verifyClaim(id: string, videoId: string, sourceId: string, status: "supported" | "conflicted", evidenceExcerpt: string, confidence: number) {
    const validSource = (await this.db.select({ id: sources.id }).from(sources).where(and(eq(sources.id, sourceId), eq(sources.videoId, videoId))).limit(1))[0];
    if (!validSource) return undefined;
    const item = (await this.db.update(claims).set({ sourceId, status, evidenceExcerpt, confidence, updatedAt: now() }).where(and(eq(claims.id, id), eq(claims.videoId, videoId))).returning())[0];
    if (item) {
      const result = await this.db.select({ count: sql<number>`count(*)::int` }).from(claims).where(and(eq(claims.sourceId, sourceId), sql`${claims.status} <> 'unverified'`));
      await this.db.update(sources).set({ claimCount: result[0]?.count ?? 0, updatedAt: now() }).where(eq(sources.id, sourceId));
    }
    return item;
  }
  async getActivity() { return this.db.select().from(activity).orderBy(desc(activity.createdAt)).limit(8); }
  async health() {
    try { await this.client`select 1`; return { driver: "postgres" as const, healthy: true }; }
    catch { return { driver: "postgres" as const, healthy: false }; }
  }
}

if (process.env.APP_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required when APP_ENV=production");
}
export const storage: IStorage = process.env.DATABASE_URL ? new PostgresStorage(process.env.DATABASE_URL) : new MemStorage();
