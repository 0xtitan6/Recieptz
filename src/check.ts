import { triage } from "./triage.js";
import { COVERED_DOMAINS, gather } from "./evidence/index.js";
import { runJury } from "./jury.js";
import { buildReceipt, saveReceipt } from "./receipt.js";
import type { Receipt } from "./types.js";

export type CheckResult =
  | { declined: true; reason: string }
  | { declined: false; uncovered: true }
  | { declined: false; uncovered: false; receipt: Receipt };

export async function runCheck(post: string, postId: string | null = null): Promise<CheckResult> {
  const t = await triage(post);
  if (t.kind === "decline") return { declined: true, reason: t.reason };

  const claim = t.claims[0]; // hackathon scope: first claim only
  const evidence = await gather(claim.text, claim.domain);
  if (evidence.length === 0) return { declined: false, uncovered: true };

  const j = await runJury(claim.text, evidence);

  const receipt: Receipt = buildReceipt({
    postId, claimText: claim.text, evidence,
    votes: j.votes, redTeam: j.redTeam, auditor: j.auditor,
    verdict: j.verdict, confidence: j.confidence, escalated: j.escalated, supersedes: null,
  });
  saveReceipt(receipt);
  return { declined: false, uncovered: false, receipt };
}

// CLI: npm run check -- "claim text"
if (process.argv[1]?.endsWith("check.ts")) {
  const text = process.argv.slice(2).join(" ");
  runCheck(text).then((r) => {
    if (r.declined) return console.log(`Declined (${r.reason}). Not a checkable public claim.`);
    if (r.uncovered) return console.log(`I can't check this against primary records yet. Covered today: ${COVERED_DOMAINS.join(", ")}.`);
    const x = r.receipt;
    console.log(`${x.verdict} (confidence ${x.confidence.toFixed(2)})`);
    console.log(`Sources: ${x.evidence.map((e) => e.name).join("; ")}`);
    console.log(`Receipt: ${x.code}  -> receipts/${x.code}.json`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
