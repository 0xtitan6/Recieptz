import { cfg } from "./config.js";

export interface LlmResult { json: any; raw: any }

/** Calls an OpenAI-compatible /chat/completions endpoint and parses a JSON reply. */
export async function chatJSON(model: string, system: string, user: string): Promise<LlmResult> {
  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${model} failed: ${res.status} ${await res.text()}`);
  const raw = await res.json();
  const text: string = raw.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  return { json: JSON.parse(cleaned), raw };
}
