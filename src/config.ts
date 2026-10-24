import "dotenv/config";

export interface JurorCfg { id: string; lab: string }

export const cfg = {
  baseURL: process.env.LLM_BASE_URL ?? "https://cloud-api.near.ai/v1",
  apiKey: process.env.LLM_API_KEY ?? "",
  triageModel: process.env.TRIAGE_MODEL ?? "",
  redTeamModel: process.env.RED_TEAM_MODEL ?? "",
  jurors: JSON.parse(process.env.JURORS ?? "[]") as JurorCfg[],
  blsKey: process.env.BLS_API_KEY ?? "",
};
