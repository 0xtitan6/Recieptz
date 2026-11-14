import type { Evidence } from "../types.js";
import { COVERED_DOMAINS as PRIMARY_DOMAINS } from "./catalog.js";
import { fetchBls } from "./bls.js";
import { fetchBea } from "./bea.js";
import { fetchCensus } from "./census.js";
import { fetchCongressMajority } from "./congress.js";
import { fetchEthBalance, fetchNearBalance, fetchProtocolTvl } from "./crypto.js";
import { fetchEdgar } from "./edgar.js";
import { fetchQuote } from "./quote.js";
import { fetchCrypto } from "./coingecko.js";
import { fetchWikipedia } from "./wikipedia.js";
import { fetchTavily } from "./tavily.js";
import { routeEvidence } from "./route.js";

/** Every triage domain gets a check: primary records where a router query fits, reference + web sources otherwise. */
export const COVERED_DOMAINS: string[] = [...PRIMARY_DOMAINS, "other"];

/** Primary record chosen by the LLM router from the allowlisted catalog (tier 1 / 2). */
async function primary(claimText: string, domain: string): Promise<Evidence[]> {
  if (!(PRIMARY_DOMAINS as readonly string[]).includes(domain)) return [];
  const route = await routeEvidence(claimText, domain);
  console.error(`Evidence route: ${JSON.stringify(route)}`);
  switch (route.source) {
    case "bls": return fetchBls(route.seriesIds, route.startYear, route.endYear);
    case "bea": return fetchBea(route.tables);
    case "census": return fetchCensus(route.variables);
    case "congress": return fetchCongressMajority();
    case "crypto":
      if (route.kind === "eth_balance") return fetchEthBalance(route.address);
      if (route.kind === "near_balance") return fetchNearBalance(route.account);
      return fetchProtocolTvl(route.slug);
    case "edgar": return fetchEdgar(route.ticker, route.metric);
    case "quote": return fetchQuote(route.ticker);
    default: return [];
  }
}

type Named = { name: string; run: () => Promise<Evidence[]> };

/** Secondary sources: always for politics/crypto/other; for stats domains only as a fallback. */
function secondary(claimText: string, domain: string): Named[] {
  const wiki: Named = { name: "Wikipedia", run: () => fetchWikipedia(claimText) };
  const web: Named = { name: "Tavily", run: () => fetchTavily(claimText) };
  const coins: Named = { name: "CoinGecko", run: () => fetchCrypto() };
  if (domain === "crypto") return [coins, wiki, web];
  if (domain === "politics" || domain === "other") return [wiki, web];
  return [web]; // economy, companies, markets
}

async function settle(sources: Named[]): Promise<Evidence[]> {
  const results = await Promise.allSettled(sources.map((s) => s.run()));
  const out: Evidence[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.error(`${sources[i].name} fetch failed:`, r.reason?.message ?? r.reason);
  }
  return out;
}

export async function gather(domain: string, claimText: string): Promise<Evidence[]> {
  const stats = domain === "economy" || domain === "companies" || domain === "markets";
  const [prim, sec] = await Promise.all([
    settle([{ name: "Primary", run: () => primary(claimText, domain) }]),
    stats ? Promise.resolve([] as Evidence[]) : settle(secondary(claimText, domain)),
  ]);
  // Stats claims fall back to the web only when no primary record fits.
  const extra = stats && prim.length === 0 ? await settle(secondary(claimText, domain)) : [];
  return [...prim, ...sec, ...extra].sort((a, b) => a.tier - b.tier);
}
