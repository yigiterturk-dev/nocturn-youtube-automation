import { config } from "../config";

// DeepSeek speaks the OpenAI chat-completions protocol. JSON mode requires the word "json" in the prompt.
export async function deepseekJson<T>(system: string, user: string, maxTokens = 8000): Promise<T> {
  if (!config.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not configured");
  const response = await fetch(`${config.DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: config.DEEPSEEK_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as { choices: { message: { content: string }; finish_reason: string }[]; usage?: Record<string, number> };
  const choice = body.choices[0];
  if (choice?.finish_reason === "length") throw new Error("DeepSeek output was truncated (max_tokens reached)");
  try {
    return JSON.parse(choice.message.content) as T;
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}
