// End-to-end check of voiceover + render through the real worker, with a fixed script and visual plan
// standing in for DeepSeek output. Run with ALLOW_LOCAL_TTS=true and no ELEVENLABS key for a free run.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { productionJobs, videos } from "@shared/schema";
import { scriptFromSections, splitIntoScenes } from "../server/editorial";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);
const sections = [
  { chapter: "The Seabed Cloud", narration: "In 2018, Microsoft lowered a sealed data center 117 feet beneath the North Sea. Inside were 864 servers and nobody could touch them for two years." },
  { chapter: "What Came Back", narration: "When engineers pulled it up, the failure rate was one eighth of the land control group. Dry nitrogen and no human hands seem to have helped." },
  { chapter: "Why It Matters", narration: "Half of the world's population lives near a coast. If compute can live there too, latency drops and cooling comes almost for free." },
];
const video = (await db.insert(videos).values({ title: "E2E: The Cloud Has a Seabed", niche: "future technology", status: "Research", progress: 10, owner: "e2e", due: "-", originality: 90, sourceCount: 0, script: scriptFromSections(sections) }).returning())[0];
const scenes = splitIntoScenes(sections, 22).map((scene, index) => ({ index, ...scene, title: ["THE CLOUD, UNDER THE SEA", "864 SERVERS", "ONE EIGHTH", "NO HUMAN HANDS", "THE COAST", "FREE COOLING"][index] ?? "SCENE", stat: index === 1 ? "864 SERVERS · 2 YEARS" : "", query: "ocean" }));
const plan = { scenes, shorts: [{ startScene: 0, endScene: 2, hook: "Microsoft sank 864 servers on purpose" }], thumbnail: { text: "SERVERS UNDERWATER", query: "ocean" } };
await db.insert(productionJobs).values({ videoId: video.id, kind: "visual_plan", provider: "fixture", status: "completed", progress: 100, output: { plan, visuals: [], stockScenes: 0 } });
const run = (args: string[]) => execFileSync("npx", ["tsx", ...args], { stdio: "inherit", env: process.env });

// Queue through the same gate the API uses, then let the worker take it.
const { queueProductionStage, reviewProductionJob } = await import("../server/ai-workflow");
const voice = await queueProductionStage(video.id, "voiceover");
if (voice?.status !== "queued") throw new Error(`voiceover should be queued, got ${voice?.status}`);
const blockedRender = await queueProductionStage(video.id, "render");
if (blockedRender?.status !== "waiting_for_prerequisites") throw new Error(`render must wait for voiceover approval, got ${blockedRender?.status}`);
run(["server/worker.ts", "--once"]);
const voiced = (await db.select().from(productionJobs).where(eq(productionJobs.id, voice.id)))[0];
if (voiced.status !== "ready_for_review") throw new Error(`voiceover ended ${voiced.status}: ${voiced.error}`);
await reviewProductionJob(voice.id, "completed", "e2e approval");
// The worker promotes the waiting render job on its own once voiceover is approved.
run(["server/worker.ts", "--once"]);
const render = (await db.select().from(productionJobs).where(eq(productionJobs.id, blockedRender.id)))[0];
if (render.status !== "ready_for_review") throw new Error(`render ended ${render.status}: ${render.error}`);
const outputDir = render.output.outputDir as string;
for (const file of render.output.files as string[]) if (!existsSync(join(outputDir, file))) throw new Error(`missing ${file}`);
console.log(JSON.stringify({ videoId: video.id, renderJob: render.id, outputDir, report: render.output.report }, null, 1));
if (!process.env.KEEP_E2E) {
  await db.delete(videos).where(eq(videos.id, video.id));
  rmSync(join(process.env.MEDIA_DIR ?? "./media", "videos", video.id), { recursive: true, force: true });
}
await client.end();
