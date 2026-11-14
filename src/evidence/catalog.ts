/** Allowlist of queries. The router may only return ids from the domain it was given. */

export const BLS_SERIES: Record<string, string> = {
  LNS14000000: "Unemployment rate, seasonally adjusted (%)",
  CUUR0000SA0: "CPI-U, all items, NSA (index)",
  CES0000000001: "Total nonfarm payrolls (thousands)",
};

export const BEA_TABLES = [
  { table: "T10101", freq: "Q", line: "1", name: "Real GDP, % change from preceding period" },
  { table: "T10105", freq: "Q", line: "1", name: "Gross domestic product, current dollars" },
  { table: "T20600", freq: "M", line: "1", name: "Personal income" },
] as const;

export const CENSUS_VARIABLES = {
  pop: "Total population",
  income: "Median household income (inflation-adjusted dollars)",
  poverty: "Poverty rate",
} as const;

export const CONGRESS_QUERIES = {
  party_majority: "Current House and Senate member counts by party",
} as const;

export const EDGAR_METRICS: Record<string, string> = {
  Revenues: "Revenues",
  NetIncomeLoss: "Net income (loss)",
  EarningsPerShareDiluted: "Diluted earnings per share",
  Assets: "Total assets",
  GrossProfit: "Gross profit",
};

export const COVERED_DOMAINS = ["economy", "politics", "crypto", "companies", "markets"] as const;

export type CensusVariable = keyof typeof CENSUS_VARIABLES;
export type BeaTableName = (typeof BEA_TABLES)[number]["table"];
export type CongressQuery = keyof typeof CONGRESS_QUERIES;
export type EdgarMetric = keyof typeof EDGAR_METRICS;

export function routerCatalog(domain: string): string {
  switch (domain) {
    case "economy":
      return [
        "BLS series (set start_year and end_year; use the current and previous year if the claim names none):",
        ...Object.entries(BLS_SERIES).map(([id, name]) => `- ${id}: ${name}`),
        "BEA NIPA tables:",
        ...BEA_TABLES.map((t) => `- ${t.table}: ${t.name}`),
        "Census ACS variables (United States):",
        ...Object.entries(CENSUS_VARIABLES).map(([id, name]) => `- ${id}: ${name}`),
        'Reply with JSON only, one of:',
        '{"source":"bls","series_ids":["LNS14000000"],"start_year":"2025","end_year":"2026"}',
        '{"source":"bea","tables":["T10101"]}',
        '{"source":"census","variables":["poverty"]}',
        '{"source":"none"}',
      ].join("\n");
    case "politics":
      return [
        "Congress.gov:",
        `- party_majority: ${CONGRESS_QUERIES.party_majority}`,
        "Use party_majority only when the claim is about which party holds a majority of Congress, the House, or the Senate.",
        "Individual votes, bills, and named members are not available. Return none for those.",
        'Reply with JSON only: {"source":"congress","query":"party_majority"} or {"source":"none"}',
      ].join("\n");
    case "crypto":
      return [
        "Pick one. Copy an address or account only if it appears in the claim. Do not invent one.",
        '- eth_balance: ETH balance of a 0x address. {"source":"crypto","kind":"eth_balance","address":"0x..."}',
        '- near_balance: NEAR balance of an account such as name.near. {"source":"crypto","kind":"near_balance","account":"name.near"}',
        '- protocol_tvl: current TVL of a DeFi protocol. slug is the DefiLlama slug. {"source":"crypto","kind":"protocol_tvl","slug":"aave-v3"}',
        "Token transfers, dumps, and price history are not available. Return none for those.",
        'Or {"source":"none"}',
      ].join("\n");
    case "companies":
      return [
        "SEC EDGAR company facts. ticker is the US stock ticker. metric is one of:",
        ...Object.entries(EDGAR_METRICS).map(([id, name]) => `- ${id}: ${name}`),
        "Share prices are not filings. Return none for a price claim.",
        '{"source":"edgar","ticker":"AAPL","metric":"NetIncomeLoss"}',
        'Or {"source":"none"}',
      ].join("\n");
    case "markets":
      return [
        "US share price from a daily chart. ticker is 1-5 letters, or a class share such as BRK-B.",
        "This is a price quote, not an SEC filing.",
        '{"source":"quote","ticker":"NVDA"}',
        'Or {"source":"none"}',
      ].join("\n");
    default:
      return 'Reply with JSON only: {"source":"none"}';
  }
}
