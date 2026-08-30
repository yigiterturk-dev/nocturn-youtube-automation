type SearchItem = { id?: { videoId?: string } };
type VideoItem = {
  id: string;
  snippet: { title: string; categoryId: string; publishedAt: string; channelId: string; channelTitle: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};
type ChannelItem = { id: string; statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string } };
type ApiResponse<T> = { items?: T[]; error?: { message?: string } };

export type TrendCandidate = {
  externalId: string;
  topic: string;
  niche: string;
  signal: string;
  velocity: number;
  opportunity: number;
  competition: string;
  shelfLife: string;
  sourceCount: number;
  raw: Record<string, unknown>;
  snapshot: {
    views: number; likes: number; comments: number; viewsPerHour: number;
    acceleration: number; outlierScore: number; engagementRate: number;
  };
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const number = (value?: string) => Number(value || 0);
const isoDurationSeconds = (value = "PT0S") => {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
};

export function scoreTrend(input: {
  views: number; likes: number; comments: number; ageHours: number;
  subscribers: number; channelAverageViews: number; previousViewsPerHour?: number;
  measuredViewsPerHour?: number; queryHits: number; isShort: boolean;
}) {
  const viewsPerHour = input.measuredViewsPerHour ?? input.views / Math.max(1, input.ageHours);
  const engagementRate = input.views ? ((input.likes + input.comments * 2) / input.views) * 100 : 0;
  const baseline = Math.max(250, input.channelAverageViews || input.subscribers * 0.08);
  const outlierScore = input.views / baseline;
  const acceleration = input.previousViewsPerHour
    ? ((viewsPerHour - input.previousViewsPerHour) / Math.max(1, input.previousViewsPerHour)) * 100
    : 0;
  const demand = clamp(Math.log10(Math.max(10, viewsPerHour)) * 22);
  const outlier = clamp(Math.log2(Math.max(1, outlierScore)) * 18 + 25);
  const engagement = clamp(engagementRate * 12);
  const freshness = clamp(100 - input.ageHours / (input.isShort ? 1.2 : 3));
  const accelerationScore = clamp(50 + acceleration * 0.35);
  const crossSignal = clamp(25 + input.queryHits * 22);
  const confidence = clamp(35 + (input.subscribers > 0 ? 18 : 0) + (input.channelAverageViews > 0 ? 18 : 0) + input.queryHits * 8);
  const opportunity = Math.round(clamp(
    demand * 0.24 + outlier * 0.22 + engagement * 0.13 + freshness * 0.14 +
    accelerationScore * 0.13 + crossSignal * 0.08 + confidence * 0.06,
  ));
  return { viewsPerHour, engagementRate, outlierScore, acceleration, opportunity, confidence, components: { demand, outlier, engagement, freshness, acceleration: accelerationScore, crossSignal } };
}

export function youtubeConnectorStatus() {
  const queries = (process.env.TREND_QUERIES || "future technology,hidden economy,behavior science").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    configured: Boolean(process.env.YOUTUBE_API_KEY),
    region: process.env.YOUTUBE_REGION || "US",
    categoryId: process.env.YOUTUBE_CATEGORY_ID || "0",
    mode: process.env.YOUTUBE_API_KEY ? "live-v2" : "demo",
    engine: "snapshot-outlier-v2",
    queries,
  };
}

async function youtubeGet<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY || "" });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`, { headers: { Accept: "application/json" } });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok) throw new Error(payload.error?.message || `YouTube API returned ${response.status}`);
  return payload.items || [];
}

export async function discoverYouTubeCandidates(options?: { queries?: string[]; region?: string; categoryId?: string }) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured");
  const status = youtubeConnectorStatus();
  const region = options?.region || status.region;
  const categoryId = options?.categoryId || status.categoryId;
  const queries = (options?.queries?.length ? options.queries : status.queries).slice(0, 6);
  const publishedAfter = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const hitCount = new Map<string, number>();

  const searches = await Promise.all(queries.map((q) => youtubeGet<SearchItem>("search", {
    part: "id", type: "video", order: "viewCount", maxResults: "12", q, regionCode: region,
    publishedAfter, ...(categoryId !== "0" ? { videoCategoryId: categoryId } : {}),
  })));
  for (const results of searches) for (const item of results) {
    const id = item.id?.videoId;
    if (id) hitCount.set(id, (hitCount.get(id) || 0) + 1);
  }
  const popular = await youtubeGet<VideoItem>("videos", {
    part: "id", chart: "mostPopular", maxResults: "20", regionCode: region,
    ...(categoryId !== "0" ? { videoCategoryId: categoryId } : {}),
  });
  for (const item of popular) hitCount.set(item.id, (hitCount.get(item.id) || 0) + 1);
  const ids = Array.from(hitCount.keys()).slice(0, 50);
  if (!ids.length) return [];

  const videoItems = await youtubeGet<VideoItem>("videos", { part: "snippet,statistics,contentDetails", id: ids.join(","), maxResults: "50" });
  const channelIds = Array.from(new Set(videoItems.map((item) => item.snippet.channelId)));
  const channelItems = await youtubeGet<ChannelItem>("channels", { part: "statistics", id: channelIds.join(","), maxResults: "50" });
  const channels = new Map(channelItems.map((item) => [item.id, item.statistics]));

  return videoItems.map((video) => {
    const stats = video.statistics || {};
    const channel = channels.get(video.snippet.channelId);
    return {
      video,
      views: number(stats.viewCount),
      likes: number(stats.likeCount),
      comments: number(stats.commentCount),
      subscribers: number(channel?.subscriberCount),
      channelAverageViews: number(channel?.viewCount) / Math.max(1, number(channel?.videoCount)),
      queryHits: hitCount.get(video.id) || 1,
      isShort: isoDurationSeconds(video.contentDetails?.duration) <= 60,
    };
  });
}

export function buildTrendCandidate(
  item: Awaited<ReturnType<typeof discoverYouTubeCandidates>>[number],
  previous?: { views: number; viewsPerHour: number; capturedAt: Date },
): TrendCandidate {
  const ageHours = Math.max(1, (Date.now() - new Date(item.video.snippet.publishedAt).getTime()) / 3_600_000);
  const intervalHours = previous ? Math.max(1 / 60, (Date.now() - previous.capturedAt.getTime()) / 3_600_000) : 0;
  const measuredViewsPerHour = previous ? Math.max(0, item.views - previous.views) / intervalHours : undefined;
  const score = scoreTrend({ ...item, ageHours, previousViewsPerHour: previous?.viewsPerHour, measuredViewsPerHour });
  const competition = item.subscribers > 1_000_000 ? "High" : item.subscribers > 100_000 ? "Medium" : "Low";
  return {
    externalId: `youtube:${item.video.id}`,
    topic: item.video.snippet.title,
    niche: item.video.snippet.channelTitle,
    signal: `${score.outlierScore.toFixed(1)}× outlier · ${item.queryHits} signals`,
    velocity: Math.round(score.viewsPerHour),
    opportunity: score.opportunity,
    competition,
    shelfLife: ageHours < 24 ? "24–72 hours" : ageHours < 96 ? "3–7 days" : "7–21 days",
    sourceCount: item.queryHits,
    raw: {
      youtubeVideoId: item.video.id, channelId: item.video.snippet.channelId,
      publishedAt: item.video.snippet.publishedAt, subscribers: item.subscribers,
      channelAverageViews: item.channelAverageViews, isShort: item.isShort,
      confidence: score.confidence, scoreComponents: score.components,
    },
    snapshot: {
      views: item.views, likes: item.likes, comments: item.comments,
      viewsPerHour: score.viewsPerHour, acceleration: score.acceleration,
      outlierScore: score.outlierScore, engagementRate: score.engagementRate,
    },
  };
}
