import "dotenv/config";

export interface JurorCfg { id: string; lab: string }

export const cfg = {
  baseURL: process.env.LLM_BASE_URL ?? "https://cloud-api.near.ai/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
  triageModel: process.env.TRIAGE_MODEL ?? "",
  redTeamModel: process.env.RED_TEAM_MODEL ?? "",
  jurors: JSON.parse(process.env.JURORS ?? "[]") as JurorCfg[],
  blsKey: process.env.BLS_API_KEY ?? "",
  beaKey: process.env.BEA_API_KEY ?? "",
  censusKey: process.env.CENSUS_API_KEY ?? "",
  near: {
    rpcUrl: process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org",
    contractId: process.env.NEAR_CONTRACT_ID ?? "receiptz-0xtitan6.testnet",
    triageId: process.env.NEAR_TRIAGE_ID ?? "triage.receiptz-0xtitan6.testnet",
    triageKey: process.env.NEAR_TRIAGE_KEY ?? "", // ed25519:... private key, never commit
    juryId: process.env.NEAR_JURY_ID ?? "jury.receiptz-0xtitan6.testnet",
    juryKey: process.env.NEAR_JURY_KEY ?? "",     // ed25519:... private key, never commit
  },
};
