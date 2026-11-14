import type { Evidence } from "../types.js";
import { fetchBls } from "./bls.js";
import { fetchBea } from "./bea.js";
import { fetchCensus } from "./census.js";
import { fetchCrypto } from "./coingecko.js";
import { fetchWikipedia } from "./wikipedia.js";

type Source = { name: string; fetch: (claim: string) => Promise<Evidence[]> };

const BLS: Source = { name: "BLS", fetch: () => fetchBls() };
const BEA: Source = { name: "BEA", fetch: () => fetchBea() };
const CENSUS: Source = { name: "Census", fetch: () => fetchCensus() };
const COINGECKO: Source = { name: "CoinGecko", fetch: () => fetchCrypto() };
const WIKIPEDIA: Source = { name: "Wikipedia", fetch: (c) => fetchWikipedia(c) };

/** Which specialists run for each triage domain. Primary sources first. */
const SOURCES: Record<string, Source[]> = {
  economy: [BLS, BEA, CENSUS],
  crypto: [COINGECKO, WIKIPEDIA],
  politics: [WIKIPEDIA],
  other: [WIKIPEDIA],
};

/** Domains with a built specialist. Anything else gets the out-of-coverage reply and no run. */
export const COVERED_DOMAINS = Object.keys(SOURCES);

export async function gather(domain: string, claim: string): Promise<Evidence[]> {
  const sources = SOURCES[domain] ?? [];
  const results = await Promise.allSettled(sources.map((s) => s.fetch(claim)));
  const evidence: Evidence[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === "fulfilled") evidence.push(...r.value);
    else console.error(`${sources[i].name} fetch failed:`, r.reason?.message ?? r.reason);
  }
  return evidence.sort((a, b) => a.tier - b.tier);
}
