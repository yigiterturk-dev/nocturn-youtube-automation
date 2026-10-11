import { createWriteStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config";

export type StockClip = { file: string; pexelsId: number; url: string; author: string; width: number; height: number };

type PexelsVideo = {
  id: number;
  url: string;
  duration: number;
  user: { name: string };
  video_files: { link: string; width: number; height: number; file_type: string }[];
};

// Pexels licence: free for commercial use, no attribution required. We still record the source in the rights ledger.
export async function findStockClip(query: string, destinationDir: string, exclude: Set<number>, minSeconds: number): Promise<StockClip | null> {
  if (!config.PEXELS_API_KEY) return null;
  const params = new URLSearchParams({ query, orientation: "landscape", size: "medium", per_page: "15" });
  const response = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: config.PEXELS_API_KEY },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pexels ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const { videos } = await response.json() as { videos: PexelsVideo[] };
  for (const video of videos) {
    if (exclude.has(video.id) || video.duration < Math.min(minSeconds, 8)) continue;
    const file = video.video_files
      .filter((candidate) => candidate.file_type === "video/mp4" && candidate.width >= 1280 && candidate.width <= 2560)
      .sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920))[0];
    if (!file) continue;
    const destination = `${destinationDir}/pexels-${video.id}.mp4`;
    if (!existsSync(destination)) {
      const download = await fetch(file.link, { signal: AbortSignal.timeout(180_000) });
      if (!download.ok || !download.body) continue;
      await pipeline(Readable.fromWeb(download.body as never), createWriteStream(destination));
    }
    return { file: destination, pexelsId: video.id, url: video.url, author: video.user.name, width: file.width, height: file.height };
  }
  return null;
}
