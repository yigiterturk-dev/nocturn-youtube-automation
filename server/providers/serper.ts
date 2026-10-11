import { config } from "../config";

export type SearchResult = { title: string; link: string; snippet: string };

export async function webSearch(query: string, num = 10): Promise<SearchResult[]> {
  if (!config.SERPER_API_KEY) throw new Error("SERPER_API_KEY is not configured");
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": config.SERPER_API_KEY },
    body: JSON.stringify({ q: query, num, gl: "us", hl: "en" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Serper ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json() as { organic?: SearchResult[] };
  return (body.organic ?? []).filter((result) => result.link && result.title);
}

// Primary and reputable secondary sources first; platforms that host opinions or other creators' videos never count.
const BLOCKED = /(^|\.)(youtube\.com|youtu\.be|reddit\.com|quora\.com|pinterest\.|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|medium\.com|amazon\.|ebay\.|wikihow\.com|news\.ycombinator\.com|stackexchange\.com|stackoverflow\.com|slideshare\.net|scribd\.com)$/;
const PRIMARY = /(\.gov|\.edu|\.int|\.mil)(\.[a-z]{2})?$|(^|\.)(nature\.com|science\.org|arxiv\.org|nih\.gov|who\.int|worldbank\.org|imf\.org|oecd\.org|iea\.org|un\.org|europa\.eu|ieee\.org|acm\.org|sciencedirect\.com|springer\.com|pnas\.org)$/;
const REPUTABLE = /(^|\.)(reuters\.com|apnews\.com|bbc\.co\.uk|bbc\.com|ft\.com|economist\.com|bloomberg\.com|wsj\.com|nytimes\.com|theguardian\.com|wired\.com|arstechnica\.com|technologyreview\.com|newscientist\.com|scientificamerican\.com|axios\.com|cnbc\.com|wikipedia\.org)$/;

export function rankSource(link: string) {
  const host = new URL(link).hostname.replace(/^www\./, "");
  if (BLOCKED.test(host) || link.toLowerCase().endsWith(".pdf")) return { host, score: -1 };
  return { host, score: PRIMARY.test(host) ? 3 : REPUTABLE.test(host) ? 2 : 1 };
}

export function pickSources(results: SearchResult[], existingLinks: Set<string>, limit: number) {
  const seenHosts = new Set<string>();
  return results
    .map((result) => ({ ...result, ...rankSource(result.link) }))
    .filter((result) => result.score > 0 && !existingLinks.has(result.link))
    .sort((a, b) => b.score - a.score)
    // One page per publisher keeps the five-source rule meaning "independent".
    .filter((result) => (seenHosts.has(result.host) ? false : (seenHosts.add(result.host), true)))
    .slice(0, limit);
}
