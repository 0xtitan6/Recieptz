import { Account, type KeyPairString } from "near-api-js";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { cfg } from "./config.js";
import type { Label } from "./types.js";

function isNearKey(key: string): boolean {
  const [curve, data] = key.split(":");
  return curve === "ed25519" && !!data;
}

/** True when both agent keys are present in the ed25519:... form the signer requires. */
export function nearReady(): boolean {
  return isNearKey(cfg.near.triageKey) && isNearKey(cfg.near.juryKey);
}

// Each agent signs with its own account; the contract rejects any other caller.
const triage = () => new Account(cfg.near.triageId, cfg.near.rpcUrl, cfg.near.triageKey as KeyPairString);
const jury = () => new Account(cfg.near.juryId, cfg.near.rpcUrl, cfg.near.juryKey as KeyPairString);

/** Commit the claim on-chain before any juror runs. Creates a Pending run. */
export async function registerClaim(a: {
  runId: string; claimPostId: string; claimHash: string; juryConfig: string;
}): Promise<void> {
  await triage().callFunction({
    contractId: cfg.near.contractId,
    methodName: "register_claim",
    args: { run_id: a.runId, claim_post_id: a.claimPostId, claim_hash: a.claimHash, jury_config: a.juryConfig },
    gas: "30000000000000", // 30 Tgas
  });
}

/** Record the one verdict for a run. After the timeout the contract stores it as Late. */
export async function submitVerdict(runId: string, label: Label, receiptCid: string): Promise<void> {
  await jury().callFunction({
    contractId: cfg.near.contractId,
    methodName: "submit_verdict",
    args: { run_id: runId, label, receipt_cid: receiptCid },
    gas: "30000000000000",
  });
}

/**
 * IPFS CID (v1, raw, sha-256) of the receipt bytes. Pinning these exact bytes
 * as a raw block later produces the same CID, so the on-chain value stays valid.
 */
export async function receiptCid(bytes: Uint8Array): Promise<string> {
  return CID.create(1, raw.code, await sha256.digest(bytes)).toString();
}
