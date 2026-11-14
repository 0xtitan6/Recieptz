import { z } from "zod";
import { chatJSON } from "../llm.js";
import { cfg } from "../config.js";
import { routerPrompt } from "../prompts.js";
import {
  BEA_TABLES, BLS_SERIES, CENSUS_VARIABLES, CONGRESS_QUERIES, EDGAR_METRICS,
  type BeaTableName, type CensusVariable, type CongressQuery, type EdgarMetric,
} from "./catalog.js";

const Year = z.union([z.string(), z.number()]).transform((v) => String(v));

const Schema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("none") }),
  z.object({
    source: z.literal("bls"),
    series_ids: z.array(z.string()).min(1).max(3),
    start_year: Year,
    end_year: Year,
  }),
  z.object({
    source: z.literal("bea"),
    tables: z.array(z.string()).min(1).max(3),
  }),
  z.object({
    source: z.literal("census"),
    variables: z.array(z.string()).min(1).max(3),
  }),
  z.object({ source: z.literal("congress"), query: z.string() }),
  z.object({
    source: z.literal("crypto"),
    kind: z.enum(["eth_balance", "near_balance", "protocol_tvl"]),
    address: z.string().optional(),
    account: z.string().optional(),
    slug: z.string().optional(),
  }),
  z.object({ source: z.literal("edgar"), ticker: z.string(), metric: z.string() }),
  z.object({ source: z.literal("quote"), ticker: z.string() }),
]);

const FOR_DOMAIN: Record<string, string[]> = {
  economy: ["bls", "bea", "census"],
  politics: ["congress"],
  crypto: ["crypto"],
  companies: ["edgar"],
  markets: ["quote"],
};

export type EvidenceRoute =
  | { source: "none" }
  | { source: "bls"; seriesIds: string[]; startYear: string; endYear: string }
  | { source: "bea"; tables: BeaTableName[] }
  | { source: "census"; variables: CensusVariable[] }
  | { source: "congress"; query: CongressQuery }
  | { source: "crypto"; kind: "eth_balance"; address: string }
  | { source: "crypto"; kind: "near_balance"; account: string }
  | { source: "crypto"; kind: "protocol_tvl"; slug: string }
  | { source: "edgar"; ticker: string; metric: EdgarMetric }
  | { source: "quote"; ticker: string };

function clampYears(start: string, end: string): { startYear: string; endYear: string } {
  const now = new Date().getFullYear();
  let endYear = Number(end);
  let startYear = Number(start);
  if (!Number.isInteger(endYear) || endYear < 1990 || endYear > now) endYear = now;
  if (!Number.isInteger(startYear) || startYear > endYear || startYear < endYear - 10) {
    startYear = Math.max(1990, endYear - 1);
  }
  return { startYear: String(startYear), endYear: String(endYear) };
}

/** Ask the triage model which allowlisted query answers this claim. Unknown ids are dropped. */
export async function routeEvidence(claimText: string, domain: string): Promise<EvidenceRoute> {
  const { json } = await chatJSON(cfg.triageModel, routerPrompt(domain), `<claim>\n${claimText}\n</claim>`);
  const parsed = Schema.safeParse(json);
  if (!parsed.success) return { source: "none" };

  const pick = parsed.data;
  if (pick.source === "none") return { source: "none" };
  if (!FOR_DOMAIN[domain]?.includes(pick.source)) return { source: "none" };

  if (pick.source === "bls") {
    const seriesIds = pick.series_ids.filter((id) => id in BLS_SERIES);
    if (seriesIds.length === 0) return { source: "none" };
    return { source: "bls", seriesIds, ...clampYears(pick.start_year, pick.end_year) };
  }

  if (pick.source === "bea") {
    const allowed = new Set<string>(BEA_TABLES.map((t) => t.table));
    const tables = pick.tables.filter((t): t is BeaTableName => allowed.has(t));
    if (tables.length === 0) return { source: "none" };
    return { source: "bea", tables };
  }

  if (pick.source === "census") {
    const variables = pick.variables.filter((v): v is CensusVariable => v in CENSUS_VARIABLES);
    if (variables.length === 0) return { source: "none" };
    return { source: "census", variables };
  }

  if (pick.source === "congress") {
    if (!(pick.query in CONGRESS_QUERIES)) return { source: "none" };
    return { source: "congress", query: pick.query as CongressQuery };
  }

  if (pick.source === "crypto") {
    if (pick.kind === "eth_balance" && pick.address) return { source: "crypto", kind: "eth_balance", address: pick.address.trim() };
    if (pick.kind === "near_balance" && pick.account) return { source: "crypto", kind: "near_balance", account: pick.account.trim() };
    if (pick.kind === "protocol_tvl" && pick.slug) return { source: "crypto", kind: "protocol_tvl", slug: pick.slug.trim() };
    return { source: "none" };
  }

  if (pick.source === "edgar") {
    if (!(pick.metric in EDGAR_METRICS)) return { source: "none" };
    return { source: "edgar", ticker: pick.ticker.trim(), metric: pick.metric as EdgarMetric };
  }

  return { source: "quote", ticker: pick.ticker.trim() };
}
