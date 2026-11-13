import type { Evidence } from "../types.js";
import { fetchBls } from "./bls.js";
import { fetchBea } from "./bea.js";
import { fetchCensus } from "./census.js";

const ECONOMY_SOURCES: { name: string; fetch: () => Promise<Evidence[]> }[] = [
  { name: "BLS", fetch: fetchBls },
  { name: "BEA", fetch: fetchBea },
  { name: "Census", fetch: fetchCensus },
];

export async function gather(domain: string): Promise<Evidence[]> {
  switch (domain) {
    case "economy": {
      const results = await Promise.allSettled(ECONOMY_SOURCES.map((s) => s.fetch()));
      const evidence: Evidence[] = [];
      for (const [i, r] of results.entries()) {
        if (r.status === "fulfilled") evidence.push(...r.value);
        else console.error(`${ECONOMY_SOURCES[i].name} fetch failed:`, r.reason?.message ?? r.reason);
      }
      return evidence;
    }
    // case "politics": return fetchCongress(...)   // add later
    // case "crypto":   return fetchOnchain(...)
    default: return [];
  }
}