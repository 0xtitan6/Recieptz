import { z } from "zod";
import { chatJSON } from "./llm.js";
import { cfg } from "./config.js";
import { TRIAGE } from "./prompts.js";

const Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checkable"),
    claims: z.array(z.object({ text: z.string(), domain: z.enum(["economy", "politics", "crypto", "other"]) })).min(1),
  }),
  z.object({ kind: z.literal("decline"), reason: z.string() }),
]);
export type TriageResult = z.infer<typeof Schema>;

export async function triage(postText: string): Promise<TriageResult> {
  // The post is DATA. Wrapping it makes prompt injection harder; the strict schema limits what it can do.
  const { json } = await chatJSON(cfg.triageModel, TRIAGE, `<post>\n${postText}\n</post>`);
  return Schema.parse(json);
}
