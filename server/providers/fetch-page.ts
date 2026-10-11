import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 3_000_000;

// Editor-supplied URLs are fetched server-side, so refuse anything that resolves into a private network.
function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) sources can be fetched");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Source resolves to a private address");
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\"", ndash: "-", mdash: "-", hellip: "..." };

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function fetchPageText(raw: string) {
  let url = await assertPublicUrl(raw);
  let response: Response | undefined;
  // Follow redirects by hand so every hop passes the private-address check.
  for (let hop = 0; hop < 5; hop += 1) {
    response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NocturnResearchBot/1.0)", Accept: "text/html,text/plain;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!response?.ok) throw new Error(`Source returned HTTP ${response?.status ?? "no response"}`);
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)|application\/xhtml/.test(type)) throw new Error(`Unsupported source type ${type || "unknown"} (PDFs need a text copy)`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(next.value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const text = type.includes("plain") ? body : htmlToText(body);
  return { url: url.toString(), title: title ? htmlToText(title) : null, text };
}
