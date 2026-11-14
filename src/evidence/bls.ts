import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";
import { BLS_SERIES } from "./catalog.js";

export async function fetchBls(seriesIds: string[], startYear: string, endYear: string): Promise<Evidence[]> {
  const ids = seriesIds.filter((id) => id in BLS_SERIES);
  if (ids.length === 0) return [];
  const url = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: ids,
      startyear: startYear,
      endyear: endYear,
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
      name: `BLS ${BLS_SERIES[s.seriesID] ?? s.seriesID}`,
      url: `https://data.bls.gov/timeseries/${s.seriesID}`,
      fetchedAt,
      content: `${BLS_SERIES[s.seriesID] ?? s.seriesID} (latest first)\n${rows}`,
      contentHash: hash,
    };
  });
}
