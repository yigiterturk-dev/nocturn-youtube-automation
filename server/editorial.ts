import { deepseekJson } from "./providers/deepseek";
import { lintTitle, rankHooks } from "./quality";

export type ScriptSection = { chapter: string; narration: string };
export type EditorialDossier = {
  angle: string;
  viewerPromise: string;
  hooks: string[];
  titles: { title: string; thumbnailText: string }[];
  outline: { chapter: string; summary: string }[];
  sections: ScriptSection[];
  description: string;
  tags: string[];
  claimsUsed: { claimId: string; usage: string }[];
  riskFlags: string[];
};

export type SourceInput = { id: string; title: string; url: string; publisher: string | null };
export type ClaimInput = { id: string; sourceId: string | null; text: string; evidenceExcerpt: string | null };

const RESEARCH_SYSTEM = `You are the head writer of an evidence-led, faceless English-language YouTube documentary channel about technology and the economy.
You write narration that is spoken aloud by a voice actor. Return a single json object only.
Hard rules:
- Use ONLY the verified claims supplied. Never invent names, dates, numbers, quotes or events. If a point needs a fact you were not given, phrase it as context or leave it out.
- Synthesize several sources into one original thesis. Do not retell a single source.
- Mark every factual sentence's origin through claimsUsed (claim IDs).
- Conversational, concrete, no filler ("in this video", "let's dive in", "smash that like").
- The first 15 seconds must confirm the title's promise, open a question the viewer cannot close, and prove the payoff exists.`;

export function buildResearchPrompt(video: { title: string; niche: string }, sources: SourceInput[], claims: ClaimInput[]) {
  return `Working title: ${video.title}
Niche: ${video.niche}

Verified sources:
${sources.map((source) => `- [${source.id}] ${source.title} (${source.publisher ?? "unknown publisher"}) ${source.url}`).join("\n")}

Verified claims (the only facts you may state):
${claims.map((claim) => `- [${claim.id}] ${claim.text}${claim.evidenceExcerpt ? ` | evidence: "${claim.evidenceExcerpt}"` : ""}`).join("\n")}

Write the episode. Target 1,250-1,500 spoken words in total (8-10 minutes at 150 wpm), split into 5-8 chapters.
Return json with exactly these keys:
{
  "angle": "one-sentence original thesis",
  "viewerPromise": "what the viewer will understand by the end",
  "hooks": ["5 different opening lines, 9-24 words each, using different hook formulas"],
  "titles": [{"title": "<= 60 characters, includes a number or name", "thumbnailText": "<= 3 words that do NOT repeat title words"}],
  "outline": [{"chapter": "chapter title", "summary": "one sentence"}],
  "sections": [{"chapter": "chapter title", "narration": "spoken narration for this chapter"}],
  "description": "YouTube description, 2 short paragraphs, no hashtags spam",
  "tags": ["max 8 tags"],
  "claimsUsed": [{"claimId": "claim id", "usage": "where it appears"}],
  "riskFlags": ["anything a reviewer should double-check"]
}
Give 3 titles. sections[0].narration MUST begin with hooks[0] verbatim.`;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function assessDossier(dossier: EditorialDossier, knownClaimIds: Set<string>) {
  const hooks = rankHooks(dossier.hooks);
  const titles = dossier.titles.map((option) => ({ ...option, lint: lintTitle(option.title, option.thumbnailText) }))
    .sort((a, b) => b.lint.score - a.lint.score);
  // Open with the strongest hook when it clearly beats the one the model wrote the script around.
  const opener = dossier.hooks[0];
  const best = hooks[0];
  let sections = dossier.sections;
  if (best && opener && best.hook !== opener.trim() && best.verdict >= (hooks.find((hook) => hook.hook === opener.trim())?.verdict ?? 0) + 10
    && sections[0]?.narration.startsWith(opener)) {
    sections = [{ ...sections[0], narration: best.hook + sections[0].narration.slice(opener.length) }, ...sections.slice(1)];
  }
  const wordCount = sections.reduce((sum, section) => sum + words(section.narration), 0);
  const unknownClaims = dossier.claimsUsed.filter((claim) => !knownClaimIds.has(claim.claimId)).map((claim) => claim.claimId);
  const problems = [
    wordCount < 1100 && `script is ${wordCount} words; 1,100 is the floor for an 8-minute episode`,
    wordCount > 1700 && `script is ${wordCount} words; over 1,700 runs past 11 minutes`,
    sections.length < 3 && "fewer than 3 chapters",
    unknownClaims.length && `cites claim IDs that do not exist: ${unknownClaims.join(", ")}`,
    best && best.band === "weak" && `best hook scores ${best.verdict} (weak): ${best.fix}`,
  ].filter(Boolean) as string[];
  return { sections, hooks, titles, wordCount, problems };
}

export async function writeEpisode(video: { title: string; niche: string }, sources: SourceInput[], claims: ClaimInput[]) {
  const dossier = await deepseekJson<EditorialDossier>(RESEARCH_SYSTEM, buildResearchPrompt(video, sources, claims));
  for (const key of ["hooks", "titles", "sections", "claimsUsed"] as const) {
    if (!Array.isArray(dossier[key]) || !dossier[key].length) throw new Error(`Editorial output is missing ${key}`);
  }
  const assessment = assessDossier(dossier, new Set(claims.map((claim) => claim.id)));
  return { dossier: { ...dossier, sections: assessment.sections }, assessment };
}

export const scriptFromSections = (sections: ScriptSection[]) =>
  sections.map((section) => `## ${section.chapter}\n\n${section.narration.trim()}`).join("\n\n");

export function sectionsFromScript(script: string): ScriptSection[] {
  const parts = script.split(/^##\s+/m).map((part) => part.trim()).filter(Boolean);
  if (!script.trimStart().startsWith("##")) return [{ chapter: "Introduction", narration: script.trim() }];
  return parts.map((part) => {
    const [heading, ...body] = part.split("\n");
    return { chapter: heading.trim(), narration: body.join("\n").trim() };
  });
}

export type ScenePlan = {
  index: number;
  chapter: string;
  narration: string;
  title: string;
  stat: string;
  query: string;
};
export type ShortPlan = { startScene: number; endScene: number; hook: string };
export type VisualPlan = { scenes: ScenePlan[]; shorts: ShortPlan[]; thumbnail: { text: string; query: string } };

// Scenes are cut deterministically so the narration stays verbatim; the model only annotates them.
export function splitIntoScenes(sections: ScriptSection[], maxWords = 38) {
  const scenes: { chapter: string; narration: string }[] = [];
  for (const section of sections) {
    const sentences = section.narration.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
    let buffer = "";
    for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
      if (buffer && words(buffer) + words(sentence) > maxWords) {
        scenes.push({ chapter: section.chapter, narration: buffer });
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer) scenes.push({ chapter: section.chapter, narration: buffer });
  }
  return scenes;
}

const VISUAL_SYSTEM = `You are the visual editor of a faceless documentary YouTube channel. Visuals come from licensed stock footage (Pexels) plus on-screen typography.
Return a single json object only. Never put a number or name on screen that is not in the narration you are given.`;

export async function planVisuals(title: string, sections: ScriptSection[]): Promise<VisualPlan> {
  const scenes = splitIntoScenes(sections);
  const prompt = `Episode: ${title}
Scenes (index: narration):
${scenes.map((scene, index) => `${index}: ${scene.narration}`).join("\n")}

For every scene give on-screen text and a stock-footage search query. Then choose 3 standalone vertical Shorts (each a contiguous range of scenes totalling roughly 35-55 seconds of narration at 150 wpm, so about 90-135 words) that make sense without the rest of the episode.
Return json:
{
  "scenes": [{"index": 0, "title": "2-5 word on-screen headline, uppercase", "stat": "optional short figure or label taken from the narration, else empty string", "query": "2-4 word concrete, filmable stock footage search (objects, places, actions; no abstract words)"}],
  "shorts": [{"startScene": 0, "endScene": 3, "hook": "on-screen hook line for the first 3 seconds, max 8 words"}],
  "thumbnail": {"text": "max 3 words", "query": "stock footage search for the thumbnail background"}
}
Return exactly ${scenes.length} scene entries, one per index.`;
  const plan = await deepseekJson<{ scenes: Omit<ScenePlan, "chapter" | "narration">[]; shorts: ShortPlan[]; thumbnail: VisualPlan["thumbnail"] }>(VISUAL_SYSTEM, prompt);
  const byIndex = new Map((plan.scenes ?? []).map((scene) => [Number(scene.index), scene]));
  return {
    scenes: scenes.map((scene, index) => ({
      index,
      ...scene,
      title: byIndex.get(index)?.title?.trim() || scene.chapter.toUpperCase(),
      stat: byIndex.get(index)?.stat?.trim() ?? "",
      query: byIndex.get(index)?.query?.trim() || scene.chapter,
    })),
    shorts: (plan.shorts ?? []).filter((short) => short.startScene >= 0 && short.endScene < scenes.length && short.startScene <= short.endScene).slice(0, 3),
    thumbnail: plan.thumbnail ?? { text: title.split(" ").slice(0, 3).join(" "), query: scenes[0]?.chapter ?? title },
  };
}

// Quotes, dashes and whitespace differ between what the model echoes and the page; compare on a normalized form.
export const normalizeForMatch = (text: string) => text.toLowerCase()
  .replace(/\[\s*(\d+|[a-z]|citation needed)\s*\]/g, " ")
  .replace(/[‘’‚‛′]/g, "'").replace(/[“”„″]/g, "\"")
  .replace(/[‐-―−]/g, "-").replace(/ /g, " ").replace(/\s+/g, " ").trim();

export function excerptAppearsIn(pageText: string, excerpt: string) {
  const needle = normalizeForMatch(excerpt).replace(/^[\s"'.…]+|[\s"'.…]+$/g, "");
  return needle.length >= 20 && normalizeForMatch(pageText).includes(needle);
}

export type ExtractedClaim = { text: string; excerpt: string };

const EXTRACT_SYSTEM = `You extract checkable facts from one source document for a documentary researcher. Return a single json object only.
Each claim must be a single, specific, self-contained factual statement (numbers, dates, names, outcomes), written in your own words.
Each excerpt must be copied VERBATIM from the document: one or two consecutive sentences, unchanged, that prove the claim. If you cannot quote it exactly, leave the claim out.`;

export async function extractClaims(episodeTitle: string, source: { title: string; url: string }, pageText: string, limit = 8) {
  // ~12k words keeps the request well inside the model's context and cost budget.
  const document = pageText.split(/\s+/).slice(0, 12_000).join(" ");
  const result = await deepseekJson<{ claims?: ExtractedClaim[] }>(EXTRACT_SYSTEM, `Episode being researched: ${episodeTitle}
Source: ${source.title} (${source.url})

Document:
"""
${document}
"""

Return json {"claims": [{"text": "claim in your words", "excerpt": "verbatim supporting sentence(s)"}]} with at most ${limit} claims that are most useful for this episode.`, 4000);
  return (result.claims ?? []).filter((claim) => typeof claim.text === "string" && typeof claim.excerpt === "string" && claim.text.trim().length >= 8);
}
