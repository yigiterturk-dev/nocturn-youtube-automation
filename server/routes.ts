import type { Express } from "express";
import type { Server } from "http";
import { insertClaimSchema, insertOpportunitySchema, insertSourceSchema, insertTrendWatchlistSchema, insertVideoSchema, publishApprovalSchema, queueProductionStageSchema, reviewProductionJobSchema, updateSourceSchema, updateVideoSchema, verifyClaimSchema } from "@shared/schema";
import { storage } from "./storage";
import { youtubeConnectorStatus } from "./youtube";
import { currentMember, login, requireRole, revokeToken } from "./auth";
import { z } from "zod";
import { resolve, sep } from "node:path";
import { config } from "./config";
import { completeYouTubeAuthorization, createYouTubeAuthorization, youtubeOAuthStatus } from "./youtube-oauth";
import { aiProviderStatus, editorialOutputContract, getProductionJob, listProductionJobs, queueSourceExtraction, queueEditorialResearch, queueProductionStage, reviewProductionJob, setPublishApproval } from "./ai-workflow";
import { operationalMetrics } from "./observability";
import { createTrendWatchlist, listTrendWatchlists, scanTrendWatchlist, trendEngineStatus } from "./trend-engine";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post("/api/auth/login", async (req, res) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(8).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Valid email and password are required" });
    const result = await login(parsed.data.email, parsed.data.password);
    if (!result) return res.status(401).json({ message: "Invalid email or password" });
    return res.json(result);
  });
  app.get("/api/auth/me", async (req, res) => {
    const member = await currentMember(req);
    return member ? res.json({ member }) : res.status(401).json({ message: "No active session" });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const header = req.header("authorization");
    if (header?.startsWith("Bearer ")) await revokeToken(header.slice(7));
    return res.status(204).end();
  });
  app.get("/api/youtube/oauth/status", requireRole("viewer"), async (_req, res) => {
    return res.json(youtubeOAuthStatus());
  });
  app.post("/api/youtube/oauth/start", requireRole("owner"), async (req, res) => {
    if (!req.authMember) return res.status(401).json({ message: "Authentication required" });
    if (!youtubeOAuthStatus().configured) return res.status(409).json({ message: "Google OAuth is not configured" });
    const authorizationUrl = await createYouTubeAuthorization(req.authMember.id, req.authMember.workspaceId);
    return res.json({ authorizationUrl });
  });
  app.get("/api/youtube/oauth/callback", async (req, res) => {
    const parsed = z.object({ code: z.string().min(1), state: z.string().min(20) }).safeParse(req.query);
    if (!parsed.success) return res.status(400).send("Invalid OAuth callback");
    try {
      await completeYouTubeAuthorization(parsed.data.code, parsed.data.state);
      return res.redirect("/#/settings?youtube=connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth connection failed";
      return res.status(400).send(`YouTube connection failed: ${message}`);
    }
  });
  app.get("/api/health", async (_req, res) => {
    const database = await storage.health();
    const healthy = database.healthy;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      database,
      youtube: youtubeConnectorStatus(),
      ai: aiProviderStatus(),
      time: new Date().toISOString(),
    });
  });
  app.get("/api/health/live", (_req, res) => {
    return res.json({ status: "alive", uptimeSeconds: Math.floor(process.uptime()), time: new Date().toISOString() });
  });
  app.get("/api/health/ready", async (_req, res) => {
    const database = await storage.health();
    return res.status(database.healthy ? 200 : 503).json({
      status: database.healthy ? "ready" : "not_ready",
      checks: { database },
      time: new Date().toISOString(),
    });
  });
  app.get("/api/operations/status", requireRole("viewer"), async (_req, res) => {
    const jobs = await listProductionJobs();
    const jobsByStatus = jobs.reduce<Record<string, number>>((result, job) => {
      result[job.status] = (result[job.status] || 0) + 1;
      return result;
    }, {});
    return res.json({
      runtime: operationalMetrics(),
      queue: { total: jobs.length, byStatus: jobsByStatus },
      connectors: { youtube: youtubeConnectorStatus(), ai: aiProviderStatus() },
      publishingScopeEnabled: false,
    });
  });
  app.get("/api/ai/status", requireRole("viewer"), async (_req, res) => {
    return res.json({ ...aiProviderStatus(), outputContract: editorialOutputContract });
  });
  app.get("/api/production-jobs", requireRole("viewer"), async (req, res) => {
    const videoId = typeof req.query.videoId === "string" ? req.query.videoId : undefined;
    return res.json(await listProductionJobs(videoId));
  });
  // Rendered artifacts (video, shorts, thumbnail, package files) for owner review and manual upload.
  app.get("/api/production-jobs/:id/files/:name", requireRole("viewer"), async (req, res) => {
    const job = await getProductionJob(String(req.params.id));
    const files = (job?.output.files as string[] | undefined) ?? [];
    const name = String(req.params.name);
    if (!job || typeof job.output.outputDir !== "string" || !files.includes(name)) return res.status(404).json({ message: "File not found" });
    const root = resolve(config.MEDIA_DIR);
    const file = resolve(job.output.outputDir, name);
    if (!file.startsWith(root + sep)) return res.status(404).json({ message: "File not found" });
    return res.sendFile(file, { dotfiles: "deny" });
  });
  app.post("/api/videos/:id/research", requireRole("editor"), async (req, res) => {
    const job = await queueEditorialResearch(String(req.params.id));
    return job ? res.status(202).json(job) : res.status(404).json({ message: "Video not found" });
  });
  app.post("/api/videos/:id/production-jobs", requireRole("editor"), async (req, res) => {
    const parsed = queueProductionStageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const job = await queueProductionStage(String(req.params.id), parsed.data.kind);
    return job ? res.status(202).json(job) : res.status(404).json({ message: "Video not found" });
  });
  app.patch("/api/production-jobs/:id/review", requireRole("owner"), async (req, res) => {
    const parsed = reviewProductionJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const result = await reviewProductionJob(String(req.params.id), parsed.data.status, parsed.data.note);
    if (!result) return res.status(404).json({ message: "Production job not found" });
    if (result.blocked) return res.status(409).json({ message: result.reason });
    return res.json(result.job);
  });
  app.patch("/api/videos/:id/publish-approval", requireRole("owner"), async (req, res) => {
    const parsed = publishApprovalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const result = await setPublishApproval(String(req.params.id), parsed.data.approved, parsed.data.note);
    if (!result) return res.status(404).json({ message: "Video not found" });
    if (result.blocked) return res.status(409).json({ message: result.reason });
    return res.json(result);
  });
  app.get("/api/videos/:id/sources", requireRole("viewer"), async (req, res) => {
    return res.json(await storage.getSources(String(req.params.id)));
  });
  app.post("/api/videos/:id/sources", requireRole("editor"), async (req, res) => {
    const parsed = insertSourceSchema.safeParse({ ...req.body, videoId: String(req.params.id) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    return res.status(201).json(await storage.createSource(parsed.data));
  });
  app.patch("/api/videos/:videoId/sources/:sourceId", requireRole("editor"), async (req, res) => {
    const parsed = updateSourceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const source = await storage.verifySource(String(req.params.sourceId), String(req.params.videoId), parsed.data.verified);
    return source ? res.json(source) : res.status(404).json({ message: "Source not found" });
  });
  app.post("/api/videos/:id/extract-claims", requireRole("editor"), async (req, res) => {
    const result = await queueSourceExtraction(String(req.params.id));
    if (!result) return res.status(404).json({ message: "Video not found" });
    if (result.blocked) return res.status(409).json({ message: result.reason });
    return res.status(202).json(result.job);
  });
  app.get("/api/videos/:id/claims", requireRole("viewer"), async (req, res) => {
    return res.json(await storage.getClaims(String(req.params.id)));
  });
  app.post("/api/videos/:id/claims", requireRole("editor"), async (req, res) => {
    const parsed = insertClaimSchema.safeParse({ ...req.body, videoId: String(req.params.id) });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    return res.status(201).json(await storage.createClaim(parsed.data));
  });
  app.patch("/api/videos/:videoId/claims/:claimId/verify", requireRole("editor"), async (req, res) => {
    const parsed = verifyClaimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const claim = await storage.verifyClaim(String(req.params.claimId), String(req.params.videoId), parsed.data.sourceId, parsed.data.status, parsed.data.evidenceExcerpt, parsed.data.confidence);
    return claim ? res.json(claim) : res.status(404).json({ message: "Claim or source not found in this video" });
  });
  app.get("/api/dashboard", async (_req, res) => {
    const currentOpportunities = await storage.getOpportunities();
    res.json({
      metrics: { activeSignals: currentOpportunities.length, pipeline: (await storage.getVideos()).length, weeklyViews: 386420, estimatedRevenue: 4280 },
      performance: [
        { day: "Mon", views: 38, ctr: 5.7 }, { day: "Tue", views: 44, ctr: 6.1 },
        { day: "Wed", views: 41, ctr: 5.9 }, { day: "Thu", views: 58, ctr: 6.8 },
        { day: "Fri", views: 64, ctr: 7.2 }, { day: "Sat", views: 71, ctr: 7.5 },
        { day: "Sun", views: 69, ctr: 7.1 }
      ],
      opportunities: currentOpportunities,
      videos: await storage.getVideos(),
      activity: await storage.getActivity(),
      connectors: { youtube: youtubeConnectorStatus() },
    });
  });
  app.get("/api/connectors", (_req, res) => {
    res.json({ youtube: youtubeConnectorStatus() });
  });
  app.post("/api/radar/scan", requireRole("editor"), async (_req, res) => {
    if (!youtubeConnectorStatus().configured) {
      return res.status(409).json({
        message: "YouTube API key is not configured",
        code: "YOUTUBE_NOT_CONFIGURED",
      });
    }
    try {
      if (!_req.authMember) return res.status(401).json({ message: "Authentication required" });
      const parsed = z.object({ watchlistId: z.string().uuid().optional() }).safeParse(_req.body || {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const result = await scanTrendWatchlist(_req.authMember.workspaceId, parsed.data.watchlistId);
      return res.json({ count: result.insertedOrUpdated, ...result });
    } catch (error) {
      return res.status(502).json({ message: error instanceof Error ? error.message : "YouTube scan failed" });
    }
  });
  app.get("/api/radar/status", requireRole("viewer"), async (req, res) => {
    if (!req.authMember) return res.status(401).json({ message: "Authentication required" });
    return res.json(await trendEngineStatus(req.authMember.workspaceId));
  });
  app.get("/api/radar/watchlists", requireRole("viewer"), async (req, res) => {
    if (!req.authMember) return res.status(401).json({ message: "Authentication required" });
    return res.json(await listTrendWatchlists(req.authMember.workspaceId));
  });
  app.post("/api/radar/watchlists", requireRole("editor"), async (req, res) => {
    if (!req.authMember) return res.status(401).json({ message: "Authentication required" });
    const parsed = insertTrendWatchlistSchema.safeParse({ ...req.body, workspaceId: req.authMember.workspaceId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    return res.status(201).json(await createTrendWatchlist(parsed.data));
  });
  app.get("/api/opportunities", async (_req, res) => res.json(await storage.getOpportunities()));
  app.post("/api/opportunities", requireRole("editor"), async (req, res) => {
    const parsed = insertOpportunitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    return res.status(201).json(await storage.createOpportunity(parsed.data));
  });
  app.get("/api/videos", async (_req, res) => res.json(await storage.getVideos()));
  app.post("/api/videos", requireRole("editor"), async (req, res) => {
    const parsed = insertVideoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    return res.status(201).json(await storage.createVideo(parsed.data));
  });
  app.patch("/api/videos/:id", requireRole("editor"), async (req, res) => {
    const parsed = updateVideoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const video = await storage.updateVideo(String(req.params.id), parsed.data.status, parsed.data.progress);
    return video ? res.json(video) : res.status(404).json({ message: "Video not found" });
  });
  return httpServer;
}
