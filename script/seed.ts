import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { activity, channels, members, opportunities, trendWatchlists, videos, workspaces } from "../shared/schema";
import { hashPassword } from "../server/auth";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 1 });
const db = drizzle(client);

const [workspace] = await db.insert(workspaces).values({
  name: "Nocturn YouTube Automation",
  slug: "nocturn-youtube",
}).onConflictDoNothing().returning();

const existing = workspace || (await db.select().from(workspaces).limit(1))[0];
if (!existing) throw new Error("Workspace seed failed");

const ownerPassword = process.env.LOCAL_SEED_OWNER_PASSWORD;
if (ownerPassword) {
  await db.insert(members).values({
    workspaceId: existing.id,
    email: (process.env.LOCAL_SEED_OWNER_EMAIL || "owner@nocturn-youtube.local").toLowerCase(),
    displayName: "Nocturn Owner",
    role: "owner",
    passwordHash: await hashPassword(ownerPassword),
  }).onConflictDoNothing();
}

if (!(await db.select({ id: channels.id }).from(channels).where(eq(channels.workspaceId, existing.id)).limit(1))[0]) {
  await db.insert(channels).values({
  workspaceId: existing.id,
  name: "Untold Systems",
  niche: "Technology, systems and hidden economies",
  language: "en",
  region: "US",
  status: "launch",
  });
}

if (!(await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.workspaceId, existing.id)).limit(1))[0]) {
  await db.insert(opportunities).values([
  { workspaceId: existing.id, topic: "Why data centers are moving underwater", niche: "Future tech", signal: "Outlier ×8.4", velocity: 184, opportunity: 92, competition: "Medium", shelfLife: "14–30 days", sourceCount: 11 },
  { workspaceId: existing.id, topic: "The hidden economy of abandoned satellites", niche: "Space economy", signal: "Search breakout", velocity: 133, opportunity: 88, competition: "Low", shelfLife: "Evergreen", sourceCount: 9 },
  { workspaceId: existing.id, topic: "How supermarkets design your decisions", niche: "Behavior science", signal: "Cross-platform", velocity: 96, opportunity: 84, competition: "Low", shelfLife: "Evergreen", sourceCount: 14 },
  ]);
}

if (!(await db.select({ id: trendWatchlists.id }).from(trendWatchlists).where(eq(trendWatchlists.workspaceId, existing.id)).limit(1))[0]) {
  await db.insert(trendWatchlists).values({
    workspaceId: existing.id,
    name: "Hidden systems opportunity map",
    queries: ["future technology", "hidden economy", "behavior science", "energy breakthrough", "space economy"],
    region: "US",
    categoryId: "0",
    active: true,
  });
}

if (!(await db.select({ id: videos.id }).from(videos).where(eq(videos.workspaceId, existing.id)).limit(1))[0]) {
  await db.insert(videos).values([
  { workspaceId: existing.id, title: "The Ocean Is Becoming a Data Center", niche: "Future tech", status: "Editorial review", progress: 72, owner: "Editorial", due: "Today, 18:00", originality: 94, sourceCount: 12 },
  { workspaceId: existing.id, title: "There Are Millions in Dead Satellites", niche: "Space economy", status: "Script", progress: 46, owner: "AI writer", due: "Tomorrow", originality: 89, sourceCount: 9 },
  ]);
}

if (!(await db.select({ id: activity.id }).from(activity).where(eq(activity.workspaceId, existing.id)).limit(1))[0]) {
  await db.insert(activity).values([
  { workspaceId: existing.id, message: "PostgreSQL workspace initialized", kind: "pass" },
  { workspaceId: existing.id, message: "YouTube connector waiting for API credentials", kind: "warning" },
  ]);
}

await client.end();
console.log(`Seeded workspace ${existing.slug}`);
