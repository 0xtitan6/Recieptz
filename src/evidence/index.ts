import type { Evidence } from "../types.js";
import { fetchBls } from "./bls.js";

export async function gather(domain: string): Promise<Evidence[]> {
  switch (domain) {
    case "economy": return fetchBls();
    // case "politics": return fetchCongress(...)   // add later
    // case "crypto":   return fetchOnchain(...)
    default: return [];
  }
}
