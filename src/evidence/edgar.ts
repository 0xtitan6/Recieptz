import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";
import { EDGAR_METRICS, type EdgarMetric } from "./catalog.js";

type Row = {
  start?: string;
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  fy?: number;
  filed?: string;
  unit: string;
};

const TAG_ALIASES: Record<string, string[]> = {
  Revenues: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "Revenue"],
  NetIncomeLoss: ["NetIncomeLoss", "ProfitLoss", "ProfitLossAttributableToOwnersOfParent"],
  EarningsPerShareDiluted: ["EarningsPerShareDiluted", "DilutedEarningsLossPerShare"],
  Assets: ["Assets"],
  GrossProfit: ["GrossProfit"],
};

let tickerFile: { cik: string; ticker: string; title: string }[] | null = null;

function tickerForms(ticker: string): string[] {
  const u = ticker.trim().toUpperCase();
  return [...new Set([u, u.replace(/\./g, "-"), u.replace(/-/g, ".")])];
}

async function secGet(url: string): Promise<{ body: string; json: any }> {
  if (!cfg.secUserAgent) {
    throw new Error('SEC_USER_AGENT is not set. Add a contact string to .env, for example: SEC_USER_AGENT="Receiptz you@example.com"');
  }
  const res = await fetch(url, { headers: { "User-Agent": cfg.secUserAgent, Accept: "application/json" } });
  const body = await res.text();
  if (!res.ok) throw new Error(`EDGAR failed: ${res.status} ${body.slice(0, 160)}`);
  return { body, json: JSON.parse(body) };
}

async function tickers() {
  if (tickerFile) return tickerFile;
  const { json } = await secGet("https://www.sec.gov/files/company_tickers.json");
  tickerFile = Object.values(json as Record<string, any>).map((r) => ({
    cik: String(r.cik_str).padStart(10, "0"),
    ticker: String(r.ticker).toUpperCase(),
    title: String(r.title),
  }));
  return tickerFile;
}

function spanDays(r: Row): number | null {
  if (!r.start || !r.end) return null;
  const ms = Date.parse(r.end) - Date.parse(r.start);
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}

/** One row per form+period. 10-Q keeps the shorter span (the quarter, not year-to-date). 10-K keeps the longer span. */
function pickRows(rows: Row[]): Row[] {
  const filed = rows.filter((r) => r.form === "10-K" || r.form === "10-Q");
  const pool = filed.length > 0 ? filed : rows;
  const byKey = new Map<string, Row>();
  for (const r of pool) {
    if (!r.end || r.val === undefined) continue;
    const key = `${r.form ?? ""}|${r.end}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, r); continue; }
    const a = spanDays(r);
    const b = spanDays(prev);
    if (a === null) continue;
    const wantShort = r.form === "10-Q";
    if (b === null || (wantShort ? a < b : a > b)) byKey.set(key, r);
  }
  return [...byKey.values()].sort((a, b) => String(b.end).localeCompare(String(a.end))).slice(0, 6);
}

export async function fetchEdgar(ticker: string, metric: EdgarMetric): Promise<Evidence[]> {
  if (!(metric in EDGAR_METRICS)) return [];
  const forms = tickerForms(ticker);
  const hit = (await tickers()).find((t) => forms.includes(t.ticker));
  if (!hit) return [];

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${hit.cik}.json`;
  const { body, json } = await secGet(url);
  // Companies switch XBRL tags over time (Apple: Revenues -> RevenueFromContractWithCustomer... after 2018).
  // Try every alias and use the one with the most recent period.
  let facts: any = null, newest = "";
  for (const tag of TAG_ALIASES[metric] ?? [metric]) {
    const f = json.facts?.["us-gaap"]?.[tag] ?? json.facts?.["ifrs-full"]?.[tag];
    if (!f) continue;
    const ends = Object.values(f.units ?? {}).flat().map((r: any) => String(r.end ?? ""));
    const last = ends.sort().at(-1) ?? "";
    if (last > newest) { newest = last; facts = f; }
  }
  const units: Record<string, any[]> = facts?.units ?? {};
  const unit = units.USD ? "USD" : units["USD/shares"] ? "USD/shares" : Object.keys(units)[0];
  if (!unit) return [];

  const rows: Row[] = (units[unit] ?? []).map((r) => ({ ...r, unit }));
  const picked = pickRows(rows);
  if (picked.length === 0) return [];

  const fmt = (n: number) => Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : String(n);
  const lines = picked.map((r) =>
    `${r.form ?? "filing"} ${[r.fp, r.fy].filter(Boolean).join(" ")} period ending ${r.end} filed ${r.filed ?? "?"}: ${fmt(Number(r.val))} ${unit}`,
  );
  return [{
    tier: 1,
    name: `SEC ${hit.ticker} ${EDGAR_METRICS[metric]}`,
    url,
    fetchedAt: new Date().toISOString(),
    content: `${hit.title} (${hit.ticker}) ${EDGAR_METRICS[metric]}, from SEC company facts (latest first)\n${lines.join("\n")}`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}
