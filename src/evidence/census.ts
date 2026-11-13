import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

// Variable IDs are from memory: verify against the year's variables.json (see notes).
const VARS = {
  pop: { est: "B01001_001E", moe: "B01001_001M", label: "Total population" },
  income: { est: "B19013_001E", moe: "B19013_001M", label: "Median household income (inflation-adjusted dollars)" },
  povTotal: { est: "B17001_001E", moe: "B17001_001M", label: "Population for whom poverty status is determined" },
  povBelow: { est: "B17001_002E", moe: "B17001_002M", label: "Population below poverty level" },
};

const BASE = "https://api.census.gov/data";
const SENTINEL = (v: string) => Number(v) <= -111111111; // Census uses large negatives for N/A

async function fetchYear(year: number) {
  const get = ["NAME", ...Object.values(VARS).flatMap((v) => [v.est, v.moe])].join(",");

  // Key-free URL: safe to store in the receipt.
  const publicUrl = `${BASE}/${year}/acs/acs1?get=${get}&for=us:*`;

  const res = await fetch(`${publicUrl}&key=${encodeURIComponent(cfg.censusKey)}`);
  const body = await res.text();
  if (res.status === 204 || res.status === 404) return null; // year not released yet
  if (!res.ok) throw new Error(`Census failed: ${res.status}`);

  let json: string[][];
  try {
    json = JSON.parse(body);
  } catch {
    // Bad key / bad variable often returns non-JSON text.
    throw new Error(`Census returned non-JSON: ${body.slice(0, 120)}`);
  }
  if (!Array.isArray(json) || json.length < 2) return null;
  return { publicUrl, body, header: json[0], row: json[1] };
}

export async function fetchCensus(): Promise<Evidence[]> {
  const thisYear = new Date().getFullYear();
  let hit: Awaited<ReturnType<typeof fetchYear>> = null;
  let year = thisYear - 1;
  for (; year >= thisYear - 3 && !hit; year--) hit = await fetchYear(year);
  year += 1; // undo the final decrement
  if (!hit) throw new Error("Census: no ACS 1-year release found for recent years");

  const fetchedAt = new Date().toISOString();
  const hash = createHash("sha256").update(hit.body).digest("hex"); // response doesn't echo the key
  const val = (id: string) => hit!.row[hit!.header.indexOf(id)];
  const num = (id: string) => (SENTINEL(val(id)) ? null : Number(val(id)));
  const fmt = (n: number | null) => (n === null ? "n/a" : n.toLocaleString("en-US"));

  const items: { name: string; content: string }[] = [];

  for (const key of ["pop", "income"] as const) {
    const v = VARS[key];
    items.push({
      name: `Census ACS ${year} ${v.label}`,
      content: `${v.label}, United States, ACS ${year} 1-year estimate\n${fmt(num(v.est))} (margin of error ±${fmt(num(v.moe))}, 90% confidence)`,
    });
  }

  const below = num(VARS.povBelow.est);
  const total = num(VARS.povTotal.est);
  if (below !== null && total) {
    items.push({
      name: `Census ACS ${year} Poverty rate (computed)`,
      content:
        `Poverty rate, United States, ACS ${year} 1-year estimate (computed: below poverty / status determined)\n` +
        `${((below / total) * 100).toFixed(1)}%  [${fmt(below)} of ${fmt(total)}]`,
    });
  }

  return items.map((it): Evidence => ({
    tier: 1,
    name: it.name,
    url: hit!.publicUrl,
    fetchedAt,
    content: it.content,
    contentHash: hash,
  }));
}