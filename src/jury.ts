import { z } from "zod";
import { chatJSON } from "./llm.js";
import { cfg, type JurorCfg } from "./config.js";
import { JUROR, RED_TEAM } from "./prompts.js";
import { PUBLISHABLE, type Evidence, type JurorVote, type Label } from "./types.js";

const VoteSchema = z.object({
  label: z.enum(["True", "False", "Misleading", "Unverified", "Contested"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  cited_urls: z.array(z.string()).default([]),
});

function evidenceBlock(ev: Evidence[]): string {
  return ev.map((e, i) => `[${i + 1}] ${e.name}\nURL: ${e.url}\nFetched: ${e.fetchedAt}\n${e.content}`).join("\n\n");
}

async function askJuror(j: JurorCfg, claim: string, ev: Evidence[]): Promise<JurorVote> {
  const { json, raw } = await chatJSON(j.id, JUROR, `<claim>${claim}</claim>\n<evidence>\n${evidenceBlock(ev)}\n</evidence>`);
  const v = VoteSchema.parse(json);
  return { modelId: j.id, lab: j.lab, label: v.label, confidence: v.confidence, reasoning: v.reasoning, citedUrls: v.cited_urls, raw };
}

/** Pure voting rules from the README. Exported so you can unit-test them. */
export function tally(votes: JurorVote[], needed: number): { label: Label; confidence: number } | null {
  const counts = new Map<Label, JurorVote[]>();
  for (const v of votes) counts.set(v.label, [...(counts.get(v.label) ?? []), v]);
  for (const [label, vs] of counts) {
    if (vs.length >= needed) return { label, confidence: Math.min(...vs.map((v) => v.confidence)) };
  }
  return null;
}

async function redTeam(claim: string, ev: Evidence[], draft: Label) {
  const { json } = await chatJSON(cfg.redTeamModel, RED_TEAM,
    `<claim>${claim}</claim>\n<draft_verdict>${draft}</draft_verdict>\n<evidence>\n${evidenceBlock(ev)}\n</evidence>`);
  return z.object({ overturn: z.boolean(), reason: z.string() }).parse(json);
}

/** Deterministic auditor: every cited URL must exist in the evidence set. */
export function audit(votes: JurorVote[], ev: Evidence[]) {
  const known = new Set(ev.map((e) => e.url));
  const problems: string[] = [];
  for (const v of votes) for (const u of v.citedUrls) if (!known.has(u)) problems.push(`${v.modelId} cited unknown source ${u}`);
  return { ok: problems.length === 0, problems };
}

export async function runJury(claim: string, ev: Evidence[]) {
  const base = {
    votes: [] as JurorVote[], redTeam: null as null | { overturn: boolean; reason: string },
    escalated: false, auditor: { ok: true, problems: [] as string[] },
  };
  if (ev.length === 0) return { ...base, verdict: "Unverified" as Label, confidence: 1 };

  const first = cfg.jurors.slice(0, 3);
  base.votes = await Promise.all(first.map((j) => askJuror(j, claim, ev)));

  let result = tally(base.votes, 3);
  if (!result) {
    const rest = cfg.jurors.slice(3, 5);
    if (rest.length === 2) {
      base.escalated = true;
      base.votes.push(...(await Promise.all(rest.map((j) => askJuror(j, claim, ev)))));
      result = tally(base.votes, 4);
    }
  }
  let verdict: Label = result?.label ?? "Contested";
  const confidence = result?.confidence ?? 0.5;

  if (PUBLISHABLE.includes(verdict)) {
    base.redTeam = await redTeam(claim, ev, verdict);
    if (base.redTeam.overturn) verdict = "Contested";
  }
  base.auditor = audit(base.votes, ev);
  if (!base.auditor.ok && PUBLISHABLE.includes(verdict)) verdict = "Unverified"; // block bad citations
  return { ...base, verdict, confidence };
}
