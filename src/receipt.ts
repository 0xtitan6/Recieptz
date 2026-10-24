import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PROMPT_VERSION } from "./prompts.js";
import type { Receipt } from "./types.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function codeFrom(hash: string): string {
  let n = BigInt("0x" + hash.slice(0, 8)), out = "";
  for (let i = 0; i < 4; i++) { out = ALPHABET[Number(n % 32n)] + out; n /= 32n; }
  return `R-${out}`;
}

export function buildReceipt(r: Omit<Receipt, "code" | "claimHash" | "promptVersion" | "timestamp" | "receiptHash">): Receipt {
  const timestamp = new Date().toISOString();
  const claimHash = sha(r.claimText);
  const body = { ...r, claimHash, promptVersion: PROMPT_VERSION, timestamp };
  const receiptHash = sha(JSON.stringify(body));
  return { ...body, code: codeFrom(receiptHash), receiptHash };
}

export function saveReceipt(r: Receipt): string {
  mkdirSync("receipts", { recursive: true });
  const path = `receipts/${r.code}.json`;
  writeFileSync(path, JSON.stringify(r, null, 2));
  return path;
}
