import assert from "node:assert/strict";
import { assessDossier, excerptAppearsIn, splitIntoScenes, type EditorialDossier } from "../server/editorial";
import { htmlToText } from "../server/providers/fetch-page";
import { captionChunks, toSrt } from "../server/media/render";
import { estimateWordTimings } from "../server/providers/elevenlabs";
import { lintTitle, rankHooks, scoreHook, validateChapters } from "../server/quality";

// Reference values produced by the original Python tools (hookscore.py / title.py) on the same inputs.
const reference = JSON.parse(process.argv[2] ?? "null") as null | { hooks: { hook: string; verdict: number; formula: string }[]; titles: { title: string; score: number }[] };
export const HOOKS = [
  "You are paying 40% more for cloud storage than you did in 2021, and nobody told you why.",
  "In this video we will basically talk about some amazing technology.",
  "Microsoft put 864 servers on the seabed for two years. What came back up surprised everyone.",
  "Why is the cheapest energy on Earth the one nobody wants to build?",
];
export const TITLES: [string, string][] = [
  ["Why Microsoft Put 864 Servers Underwater", "THE SEABED"],
  ["The Most Amazing Incredible Technology You Have Never Heard About Before Today", "AMAZING TECH"],
];

if (reference) {
  for (const expected of reference.hooks) {
    const actual = scoreHook(expected.hook);
    assert.equal(actual.verdict, expected.verdict, `hook verdict drift: ${expected.hook}`);
    assert.equal(actual.formula, expected.formula, `hook formula drift: ${expected.hook}`);
  }
  for (const expected of reference.titles) {
    const pair = TITLES.find(([title]) => title === expected.title)!;
    assert.equal(lintTitle(pair[0], pair[1]).score, expected.score, `title score drift: ${expected.title}`);
  }
  console.log(`parity with Python reference: ${reference.hooks.length} hooks, ${reference.titles.length} titles`);
}

assert.equal(rankHooks(HOOKS)[0].band !== "weak", true);
assert.equal(scoreHook(HOOKS[1]).band, "weak");
assert.ok(lintTitle(...TITLES[0]).score > lintTitle(...TITLES[1]).score);

assert.equal(validateChapters([{ start: 0, title: "A" }, { start: 30, title: "B" }, { start: 60, title: "C" }], 120).valid, true);
assert.equal(validateChapters([{ start: 5, title: "A" }, { start: 30, title: "B" }], 120).valid, false);
assert.equal(validateChapters([{ start: 0, title: "A" }, { start: 5, title: "B" }, { start: 60, title: "C" }], 120).valid, false);

const sections = [
  { chapter: "Opening", narration: "One short sentence. ".repeat(12).trim() },
  { chapter: "Middle", narration: "A second chapter starts here and keeps going for a while without stopping at all." },
];
const scenes = splitIntoScenes(sections, 20);
assert.ok(scenes.every((scene) => scene.narration.split(" ").length <= 20 || !scene.narration.includes(".")));
assert.equal(scenes.map((scene) => scene.narration).join(" ").replace(/\s+/g, " "), sections.map((section) => section.narration).join(" ").replace(/\s+/g, " "), "scene split must keep narration verbatim");
assert.ok(scenes.some((scene) => scene.chapter === "Middle"));

const chunks = captionChunks(estimateWordTimings("Microsoft lowered a sealed module. It ran for two years without anyone touching a single server inside it.", 8));
assert.ok(chunks.length >= 3 && chunks.every((chunk) => chunk.text.split(" ").length <= 7));
assert.ok(chunks.every((chunk, index) => index === 0 || chunk.start >= chunks[index - 1].start));
assert.match(toSrt(chunks), /^1\n00:00:00,000 --> /);

const dossier: EditorialDossier = {
  angle: "a", viewerPromise: "b",
  hooks: ["In this video we will basically talk about some amazing technology.", HOOKS[0]],
  titles: [{ title: TITLES[0][0], thumbnailText: TITLES[0][1] }],
  outline: [], description: "", tags: [], riskFlags: [],
  sections: [{ chapter: "Hook", narration: "In this video we will basically talk about some amazing technology. Then more." }, { chapter: "B", narration: "x" }, { chapter: "C", narration: "y" }],
  claimsUsed: [{ claimId: "c1", usage: "intro" }, { claimId: "ghost", usage: "made up" }],
};
const assessed = assessDossier(dossier, new Set(["c1"]));
assert.ok(assessed.sections[0].narration.startsWith(HOOKS[0]), "weak opener must be swapped for the strongest hook");
assert.ok(assessed.problems.some((problem) => problem.includes("ghost")), "unknown claim IDs must be flagged");
assert.ok(assessed.problems.some((problem) => problem.includes("words")), "short script must be flagged");

const page = htmlToText(`<html><head><style>.x{}</style><script>var a=1</script></head><body><nav>Menu</nav><p>In 2018 Microsoft deployed a data center[ 1 ] off the Orkney Islands &amp; ran it for two years.</p></body></html>`);
assert.ok(!page.includes("var a") && !page.includes("Menu") && page.includes("Orkney Islands & ran"));
assert.ok(excerptAppearsIn(page, "In 2018 Microsoft deployed a data center off the Orkney Islands & ran it for two years."), "citation markers must not break a real quote");
assert.ok(excerptAppearsIn(page, "MICROSOFT DEPLOYED A DATA CENTER OFF THE ORKNEY ISLANDS"), "case and spacing are tolerated");
assert.ok(!excerptAppearsIn(page, "Microsoft deployed a data center off the coast of Japan"), "invented quotes are rejected");
assert.ok(!excerptAppearsIn(page, "two years."), "too-short quotes prove nothing");

console.log("quality gates: PASS");
