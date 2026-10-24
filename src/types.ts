export type Label = "True" | "False" | "Misleading" | "Unverified" | "Contested";
export const PUBLISHABLE: Label[] = ["True", "False", "Misleading"];

export interface Evidence {
  tier: 1 | 2 | 3 | 4;
  name: string;          // e.g. "BLS unemployment rate"
  url: string;
  fetchedAt: string;     // ISO timestamp
  content: string;       // human-readable extract shown to jurors
  contentHash: string;   // sha256 of the RAW response body at fetch time
}

export interface JurorVote {
  modelId: string;
  lab: string;
  label: Label;
  confidence: number;    // 0..1
  reasoning: string;
  citedUrls: string[];
  raw: unknown;          // full API response (signatures/attestation fields live here)
}

export interface Receipt {
  code: string;
  postId: string | null;
  claimText: string;
  claimHash: string;
  evidence: Evidence[];
  votes: JurorVote[];
  redTeam: { overturn: boolean; reason: string } | null;
  auditor: { ok: boolean; problems: string[] };
  promptVersion: string;
  verdict: Label;
  confidence: number;
  escalated: boolean;
  timestamp: string;
  supersedes: string | null;
  receiptHash?: string;
}
