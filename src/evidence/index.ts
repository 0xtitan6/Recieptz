import type { Evidence } from "../types.js";
import { COVERED_DOMAINS } from "./catalog.js";
import { fetchBls } from "./bls.js";
import { fetchBea } from "./bea.js";
import { fetchCensus } from "./census.js";
import { fetchCongressMajority } from "./congress.js";
import { fetchEthBalance, fetchNearBalance, fetchProtocolTvl } from "./crypto.js";
import { fetchEdgar } from "./edgar.js";
import { fetchQuote } from "./quote.js";
import { routeEvidence } from "./route.js";

export { COVERED_DOMAINS };

export async function gather(domain: string, claimText: string): Promise<Evidence[]> {
  if (!(COVERED_DOMAINS as readonly string[]).includes(domain)) return [];

  const route = await routeEvidence(claimText, domain);
  console.error(`Evidence route: ${JSON.stringify(route)}`);
  switch (route.source) {
    case "bls":
      return fetchBls(route.seriesIds, route.startYear, route.endYear);
    case "bea":
      return fetchBea(route.tables);
    case "census":
      return fetchCensus(route.variables);
    case "congress":
      return fetchCongressMajority();
    case "crypto":
      if (route.kind === "eth_balance") return fetchEthBalance(route.address);
      if (route.kind === "near_balance") return fetchNearBalance(route.account);
      return fetchProtocolTvl(route.slug);
    case "edgar":
      return fetchEdgar(route.ticker, route.metric);
    case "quote":
      return fetchQuote(route.ticker);
    default:
      return [];
  }
}
