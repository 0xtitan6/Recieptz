import type { Evidence } from "../types.js";
import { fetchBls } from "./bls.js";
import { fetchBea } from "./bea.js";

export async function gather(domain: string): Promise<Evidence[]> {
  switch (domain) {
    case "economy": {
      const results = await Promise.allSettled([fetchBls(), fetchBea()]);
      const evidence: Evidence[] = [];
      for (const [i, r] of results.entries()) {
        const source = i === 0 ? "BLS" : "BEA";
        if (r.status === "fulfilled") evidence.push(...r.value);
        else console.error(`${source} fetch failed:`, r.reason?.message ?? r.reason);
      }
      return evidence;
    }
    // case "politics": return fetchCongress(...)   // add later
    // case "crypto":   return fetchOnchain(...)
    default: return [];
  }
}