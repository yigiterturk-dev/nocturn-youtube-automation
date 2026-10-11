import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { config } from "../config";

export type WordTiming = { word: string; start: number; end: number };
export type Narration = { file: string; duration: number; words: WordTiming[]; provider: string };

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

function wordsFromAlignment(alignment: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  alignment.characters.forEach((char, index) => {
    if (/\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) current = { word: "", start: alignment.character_start_times_seconds[index], end: 0 };
    current.word += char;
    current.end = alignment.character_end_times_seconds[index];
  });
  if (current) words.push(current);
  return words;
}

// Without real alignment, spread words across the clip by character length.
export function estimateWordTimings(text: string, duration: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((sum, word) => sum + word.length + 1, 0);
  let cursor = 0;
  return words.map((word) => {
    const span = ((word.length + 1) / total) * duration;
    const timing = { word, start: cursor, end: cursor + span };
    cursor += span;
    return timing;
  });
}

const probeDuration = (file: string) => Number(execFileSync("ffprobe", [
  "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
], { encoding: "utf8" }).trim());

export function narrationProviderReady() {
  return Boolean(config.ELEVENLABS_API_KEY) || (config.ALLOW_LOCAL_TTS && config.APP_ENV !== "production");
}

export async function synthesizeNarration(text: string, destinationBase: string, previousText?: string): Promise<Narration> {
  if (config.ELEVENLABS_API_KEY) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": config.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        text,
        model_id: config.ELEVENLABS_MODEL,
        previous_text: previousText,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json() as { audio_base64: string; alignment: Alignment | null };
    const file = `${destinationBase}.mp3`;
    writeFileSync(file, Buffer.from(body.audio_base64, "base64"));
    const duration = probeDuration(file);
    return {
      file,
      duration,
      words: body.alignment ? wordsFromAlignment(body.alignment) : estimateWordTimings(text, duration),
      provider: `elevenlabs:${config.ELEVENLABS_VOICE_ID}`,
    };
  }
  if (!narrationProviderReady()) throw new Error("ELEVENLABS_API_KEY is not configured");
  const file = `${destinationBase}.aiff`;
  writeFileSync(`${destinationBase}.txt`, text);
  execFileSync("/usr/bin/say", ["-v", "Daniel", "-r", "165", "-f", `${destinationBase}.txt`, "-o", file]);
  const duration = probeDuration(file);
  return { file, duration, words: estimateWordTimings(text, duration), provider: "macos-say:Daniel (development only)" };
}
