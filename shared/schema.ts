import { sql } from "drizzle-orm";
import { bigint, boolean, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const members = pgTable("members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("editor"),
  passwordHash: text("password_hash"),
  ...timestamps,
}, (table) => [uniqueIndex("members_workspace_email").on(table.workspaceId, table.email)]);

export const authSessions = pgTable("auth_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  youtubeChannelId: text("youtube_channel_id"),
  name: text("name").notNull(),
  niche: text("niche"),
  language: text("language").notNull().default("en"),
  region: text("region").notNull().default("US"),
  status: text("status").notNull().default("draft"),
  ...timestamps,
});

export const integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("disconnected"),
  encryptedCredentials: text("encrypted_credentials"),
  scopes: text("scopes").array(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("integrations_workspace_provider").on(table.workspaceId, table.provider)]);

export const oauthStates = pgTable("oauth_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  stateHash: text("state_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  externalId: text("external_id"),
  topic: text("topic").notNull(),
  niche: text("niche").notNull(),
  signal: text("signal").notNull(),
  velocity: real("velocity").notNull(),
  opportunity: integer("opportunity").notNull(),
  competition: text("competition").notNull(),
  shelfLife: text("shelf_life").notNull(),
  sourceCount: integer("source_count").notNull(),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [uniqueIndex("opportunities_external_id").on(table.externalId)]);

export const trendWatchlists = pgTable("trend_watchlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  queries: text("queries").array().notNull(),
  region: text("region").notNull().default("US"),
  categoryId: text("category_id").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const trendSnapshots = pgTable("trend_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  views: bigint("views", { mode: "number" }).notNull(),
  likes: bigint("likes", { mode: "number" }).notNull(),
  comments: bigint("comments", { mode: "number" }).notNull(),
  viewsPerHour: real("views_per_hour").notNull(),
  acceleration: real("acceleration").notNull().default(0),
  outlierScore: real("outlier_score").notNull(),
  engagementRate: real("engagement_rate").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  channelId: varchar("channel_id"),
  opportunityId: varchar("opportunity_id"),
  title: text("title").notNull(),
  niche: text("niche").notNull(),
  status: text("status").notNull(),
  progress: integer("progress").notNull(),
  owner: text("owner").notNull(),
  due: text("due").notNull(),
  originality: integer("originality").notNull(),
  sourceCount: integer("source_count").notNull(),
  script: text("script"),
  youtubeVideoId: text("youtube_video_id"),
  publishApproved: boolean("publish_approved").notNull().default(false),
  ...timestamps,
});

export const sources = pgTable("sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  publisher: text("publisher"),
  claimCount: integer("claim_count").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  ...timestamps,
});

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  sourceId: varchar("source_id").references(() => sources.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  status: text("status").notNull().default("unverified"),
  evidenceExcerpt: text("evidence_excerpt"),
  confidence: integer("confidence").notNull().default(0),
  ...timestamps,
});

export const productionJobs = pgTable("production_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  provider: text("provider"),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  ...timestamps,
});

export const activity = pgTable("activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id"),
  message: text("message").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVideoSchema = createInsertSchema(videos).omit({ id: true, createdAt: true, updatedAt: true });
export const updateVideoSchema = z.object({ status: z.string(), progress: z.number().int().min(0).max(100) });
export const insertSourceSchema = z.object({
  videoId: z.string().min(1),
  url: z.string().url(),
  title: z.string().trim().min(3).max(300),
  publisher: z.string().trim().max(160).nullable().optional(),
});
export const updateSourceSchema = z.object({ verified: z.boolean() });
export const insertClaimSchema = z.object({
  videoId: z.string().min(1),
  sourceId: z.string().nullable().optional(),
  text: z.string().trim().min(8).max(1000),
});
export const verifyClaimSchema = z.object({
  sourceId: z.string().uuid(),
  status: z.enum(["supported", "conflicted"]),
  evidenceExcerpt: z.string().trim().min(8).max(2000),
  confidence: z.number().int().min(0).max(100),
});
export const queueProductionStageSchema = z.object({
  kind: z.enum(["voiceover", "visual_plan", "render"]),
});
export const reviewProductionJobSchema = z.object({
  status: z.enum(["completed", "rejected"]),
  note: z.string().trim().min(3).max(500),
});
export const publishApprovalSchema = z.object({
  approved: z.boolean(),
  note: z.string().trim().min(3).max(500),
});
export const insertTrendWatchlistSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(3).max(120),
  queries: z.array(z.string().trim().min(2).max(100)).min(1).max(12),
  region: z.string().length(2).default("US"),
  categoryId: z.string().default("0"),
  active: z.boolean().default(true),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = typeof opportunities.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;
export type Activity = typeof activity.$inferSelect;
export type ProductionJob = typeof productionJobs.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type Claim = typeof claims.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type TrendWatchlist = typeof trendWatchlists.$inferSelect;
export type InsertTrendWatchlist = z.infer<typeof insertTrendWatchlistSchema>;
export type TrendSnapshot = typeof trendSnapshots.$inferSelect;
