// Heuristic quality gates ported from Jakeschincariol/youtube-agent-skill (MIT):
// hookscore.py, title.py and the chapter rules in chapters.py. hooks.json is copied verbatim.
// These are heuristics, not predictors: a low score is a reason to look again, a high one is no promise.
import hookLibrary from "./hooks.json";

type Formula = { id: string; name: string; match: string[] };
const formulas = (hookLibrary as { hooks: Formula[] }).hooks.map((formula) => ({
  ...formula,
  patterns: formula.match.map((pattern) => new RegExp(pattern, "i")),
}));

const HOOK_FILLER = new Set(["basically", "actually", "literally", "just", "really", "very", "so", "kind", "sort", "like", "guys", "hey", "welcome", "today", "video", "subscribe", "channel"]);
const HOOK_VAGUE = new Set(["amazing", "incredible", "insane", "crazy", "huge", "massive", "game", "changer", "secret", "powerful", "ultimate", "best", "revolutionary", "mind", "blowing", "unbelievable"]);
const CONCRETE = /\b(\d[\d,.]*\s?(%|k|m|x|s|h)?|\$\d|\d+\s?(second|minute|hour|day|week|month|year)s?)\b/gi;
const YOU = /\b(you|your|you're|youre|yourself)\b/gi;
const STAKE = /\b(lose|lost|wasting|waste|quit|fail|broke|cost|risk|before|stop|never|die|dying|dead)\b/gi;
const CURIOSITY = /\b(why|how|what|which|until|before|but|nobody|almost|except|reason|actually)\b/gi;

const hookWords = (text: string): string[] => text.toLowerCase().match(/[a-z0-9'%$.]+/g) ?? [];
const count = (pattern: RegExp, text: string) => text.match(pattern)?.length ?? 0;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

const hookProperties = {
  specificity(text: string) {
    const words = hookWords(text);
    if (!words.length) return 0;
    const namedThings = text.split(/\s+/).slice(1).filter((word) => /^[A-Z]/.test(word)).length;
    return clamp(34 + count(CONCRETE, text) * 22 - words.filter((word) => HOOK_VAGUE.has(word)).length * 16
      - words.filter((word) => HOOK_FILLER.has(word)).length * 5 + Math.min(18, 6 * namedThings));
  },
  address(text: string) {
    const first = count(YOU, text.split(/\s+/).slice(0, 6).join(" ")) ? 30 : 0;
    return clamp(26 + count(YOU, text) * 20 + first);
  },
  stakes(text: string) {
    return clamp(22 + count(STAKE, text) * 26 + (count(CONCRETE, text) ? 14 : 0));
  },
  curiosity(text: string) {
    const question = text.trim().endsWith("?") ? 18 : 0;
    const closed = /\b(because|so that|which means)\b/i.test(text) ? -18 : 0;
    return clamp(24 + count(CURIOSITY, text) * 17 + question + closed);
  },
  brevity(text: string) {
    const words = hookWords(text).length;
    if (!words) return 0;
    if (words >= 9 && words <= 24) return 100;
    return words < 9 ? Math.max(30, 100 - (9 - words) * 11) : Math.max(10, 100 - (words - 24) * 7);
  },
};

const hookFixes: Record<keyof typeof hookProperties, string> = {
  specificity: "swap one adjective for a number, a name or a date",
  address: "say 'you' in the first six words",
  stakes: "name what it costs the viewer to keep doing it the current way",
  curiosity: "cut the half of the sentence that answers itself",
  brevity: "9 to 24 words",
};

export type HookScore = ReturnType<typeof scoreHook>;

export function scoreHook(hook: string) {
  const properties = Object.fromEntries(
    Object.entries(hookProperties).map(([name, measure]) => [name, measure(hook)]),
  ) as Record<keyof typeof hookProperties, number>;
  const values = Object.values(properties);
  const verdict = Math.round(0.6 * (values.reduce((sum, value) => sum + value, 0) / values.length) + 0.4 * Math.min(...values));
  let formula = "Unclassified";
  let hits = 0;
  for (const candidate of formulas) {
    const matched = candidate.patterns.filter((pattern) => pattern.test(hook)).length;
    if (matched > hits) [formula, hits] = [candidate.name, matched];
  }
  const weakest = (Object.keys(properties) as (keyof typeof hookProperties)[]).reduce((low, key) => properties[key] < properties[low] ? key : low);
  return {
    hook: hook.trim(),
    properties,
    verdict,
    band: verdict >= 72 ? "strong" : verdict >= 55 ? "workable" : "weak",
    formula,
    weakest,
    fix: hookFixes[weakest],
  };
}

export const rankHooks = (hooks: string[]) => hooks.map(scoreHook).sort((a, b) => b.verdict - a.verdict);

const TITLE_VAGUE = new Set(["amazing", "incredible", "insane", "crazy", "huge", "massive", "ultimate", "best", "powerful", "secret", "revolutionary", "mindblowing", "epic", "perfect", "complete", "everything"]);
const TITLE_STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "or", "is", "are", "with", "your", "you", "my", "i", "this", "that", "it", "how", "what", "why"]);
const titleWords = (text: string): string[] => text.toLowerCase().match(/[a-z0-9']+/g) ?? [];

export type TitleLint = ReturnType<typeof lintTitle>;

export function lintTitle(title: string, thumbnailText?: string) {
  const text = title.trim();
  const chars = text.length;
  const issues: { code: string; message: string }[] = [];
  const good: string[] = [];
  if (chars > 100) issues.push({ code: "length", message: `${chars} characters; YouTube's hard limit is 100` });
  else if (chars > 60) issues.push({ code: "length", message: `${chars} characters; desktop search cuts near 60` });
  else good.push(`${chars} characters, inside the desktop cut`);
  if (chars > 40) issues.push({ code: "mobile", message: `mobile feed shows about "${text.slice(0, 40).replace(/\s+\S*$/, "")}..."` });
  const caps = text.split(/\s+/).filter((word) => word.length > 2 && word === word.toUpperCase() && /[A-Z]/.test(word));
  if (caps.length > 2) issues.push({ code: "shouting", message: `${caps.length} all-caps words` });
  const vague = Array.from(new Set(titleWords(text).filter((word) => TITLE_VAGUE.has(word))));
  if (vague.length) issues.push({ code: "vague", message: `${vague.join(", ")}: swap for a number, a name or a date` });
  if (/\d/.test(text)) good.push("carries a concrete figure");
  else issues.push({ code: "no-number", message: "no number, date or name" });
  if (text.endsWith("?")) good.push("open question");
  if (!titleWords(text).slice(0, 3).some((word) => !TITLE_STOP.has(word))) issues.push({ code: "front-load", message: "first three words are filler" });
  if (thumbnailText) {
    const thumbWords = titleWords(thumbnailText).filter((word) => !TITLE_STOP.has(word));
    const shared = Array.from(new Set(thumbWords)).filter((word) => titleWords(text).includes(word));
    if (shared.length) issues.push({ code: "duplicate", message: `thumbnail repeats the title on ${shared.join(", ")}` });
    else good.push("thumbnail and title carry different words");
    if (titleWords(thumbnailText).length > 4) issues.push({ code: "thumb-length", message: `${titleWords(thumbnailText).length} words on the thumbnail; three is the ceiling` });
  }
  return { title: text, chars, score: clamp(100 - 14 * issues.length + 4 * good.length), issues, good };
}

export type Chapter = { start: number; title: string };

// YouTube only renders chapters when the list starts at 0:00, has 3+ entries and each lasts 10s+.
export function validateChapters(chapters: Chapter[], durationSeconds: number) {
  const problems: string[] = [];
  if (chapters.length < 3) problems.push("needs at least 3 chapters");
  if (chapters[0]?.start !== 0) problems.push("first chapter must start at 0:00");
  chapters.forEach((chapter, index) => {
    const end = chapters[index + 1]?.start ?? durationSeconds;
    if (end - chapter.start < 10) problems.push(`"${chapter.title}" is shorter than 10 seconds`);
  });
  return { valid: problems.length === 0, problems };
}

export function formatTimestamp(seconds: number) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
