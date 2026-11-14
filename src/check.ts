import { randomUUID } from "node:crypto";
import { triage } from "./triage.js";
import { COVERED_DOMAINS, gather } from "./evidence/index.js";
import { runJury } from "./jury.js";
import { buildReceipt, receiptBytes, saveReceipt, sha } from "./receipt.js";
import { receiptCid, registerClaim, submitVerdict } from "./near.js";
import { cfg } from "./config.js";
import type { Receipt } from "./types.js";

export type CheckResult =
  | { declined: true; reason: string }
  | { declined: false; uncovered: true }
  | { declined: false; uncovered: false; receipt: Receipt };

export async function runCheck(post: string, postId: string | null = null): Promise<CheckResult> {
  const t = await triage(post);
  if (t.kind === "decline") return { declined: true, reason: t.reason };

  const claim = t.claims[0]; // hackathon scope: first claim only
  // README: out-of-coverage claims get no verdict and no run (all triage domains are covered now).
  if (!COVERED_DOMAINS.includes(claim.domain)) return { declined: true as const, reason: "out-of-coverage" };

  // Commit before judging (README step 4). CLI checks have no post, so the claim hash stands in.
  const claimHash = sha(claim.text);
  const claimPostId = postId ?? `cli:${claimHash.slice(0, 16)}`;
  const runId = randomUUID();
  const juryConfig = cfg.jurors.map((j) => j.id).join(",");
  await registerClaim({ runId, claimPostId, claimHash, juryConfig });

  const evidence = await gather(claim.domain, claim.text);
  const j = await runJury(claim.text, evidence);

  const receipt: Receipt = buildReceipt({
    runId, contractId: cfg.near.contractId, juryConfig,
    postId: claimPostId, claimText: claim.text, evidence,
    votes: j.votes, redTeam: j.redTeam, auditor: j.auditor,
    verdict: j.verdict, confidence: j.confidence, escalated: j.escalated, supersedes: null,
  });

  // Receipt first, then verdict (ARCHITECTURE §7.3): the CID must exist before submit_verdict.
  const cid = await receiptCid(receiptBytes(receipt));
  saveReceipt(receipt);
  try {
    await submitVerdict(runId, receipt.verdict, cid);
  } catch (e) {
    // Don't register a new run to "fix" this: retry submit_verdict with the same run ID and CID.
    throw new Error(`submit_verdict failed for run ${runId} (it will show as abandoned until retried): ${(e as Error).message}`);
  }
  return { declined: false as const, receipt, cid };
}

// CLI: npm run check -- "claim text"
if (process.argv[1]?.endsWith("check.ts")) {
  const text = process.argv.slice(2).join(" ");
  runCheck(text).then((r) => {
    if (r.declined && r.reason === "out-of-coverage") {
      return console.log(`I can't check this against primary records yet. Covered today: ${COVERED_DOMAINS.join(", ")}.`);
    }
    if (r.declined) return console.log(`Declined (${r.reason}). Not a checkable public claim.`);
    if (r.uncovered) return console.log(`I can't check this against primary records yet. Covered today: ${COVERED_DOMAINS.join(", ")}.`);
    const x = r.receipt;
    console.log(`${x.verdict} (confidence ${x.confidence.toFixed(2)})`);
    console.log(`Sources: ${x.evidence.map((e) => e.name).join("; ")}`);
    console.log(`Receipt: ${x.code}  -> receipts/${x.code}.json`);
    console.log(`On-chain: run ${x.runId} on ${x.contractId}, receipt CID ${r.cid}`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
