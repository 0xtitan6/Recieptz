import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

const SERIES: Record<string, string> = {
  LNS14000000: "Unemployment rate, seasonally adjusted (%)",
  CUUR0000SA0: "CPI-U, all items, NSA (index)",
  CES0000000001: "Total nonfarm payrolls (thousands)",
};

export async function fetchBls(): Promise<Evidence[]> {
  const year = new Date().getFullYear();
  const url = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: Object.keys(SERIES),
      startyear: String(year - 1),
      endyear: String(year),
      registrationkey: cfg.blsKey,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`BLS failed: ${res.status}`);
  const fetchedAt = new Date().toISOString();
  const json = JSON.parse(body);
  const hash = createHash("sha256").update(body).digest("hex");

  return (json.Results?.series ?? []).map((s: any): Evidence => {
    const rows = (s.data as any[]).slice(0, 6) // BLS returns newest first
      .map((d) => `${d.year} ${d.periodName}: ${d.value}`).join("\n");
    return {
      tier: 1,
      name: `BLS ${SERIES[s.seriesID] ?? s.seriesID}`,
      url: `https://data.bls.gov/timeseries/${s.seriesID}`,
      fetchedAt,
      content: `${SERIES[s.seriesID] ?? s.seriesID} (latest first)\n${rows}`,
      contentHash: hash,
    };
  });
}
