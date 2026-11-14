import { createHash } from "node:crypto";
import type { Evidence } from "../types.js";

const API = "https://en.wikipedia.org/w/api.php";
const UA = { "User-Agent": "Receiptz/0.1 (https://github.com/0xtitan6/Recieptz)" };

/** Tier 3 (secondary): top Wikipedia articles for the claim, with their intro text. */
export async function fetchWikipedia(claim: string, limit = 3): Promise<Evidence[]> {
  const search = new URL(API);
  search.search = new URLSearchParams({ action: "query", list: "search", srsearch: claim, srlimit: String(limit), format: "json" }).toString();
  const s = await fetch(search, { headers: UA });
  if (!s.ok) throw new Error(`Wikipedia search failed: ${s.status}`);
  const hits = ((await s.json()).query?.search ?? []) as { pageid: number; title: string }[];
  if (!hits.length) return [];

  const ext = new URL(API);
  ext.search = new URLSearchParams({
    action: "query", prop: "extracts|info", inprop: "url", exintro: "1", explaintext: "1",
    pageids: hits.map((h) => h.pageid).join("|"), format: "json",
  }).toString();
  const res = await fetch(ext, { headers: UA });
  const body = await res.text();
  if (!res.ok) throw new Error(`Wikipedia extracts failed: ${res.status}`);
  const pages = JSON.parse(body).query?.pages ?? {};
  const fetchedAt = new Date().toISOString();

  return hits.map((h) => pages[h.pageid]).filter((p) => p?.extract).map((p): Evidence => {
    const content = `${p.title} (Wikipedia, last edited ${p.touched ?? "unknown"})\n${String(p.extract).slice(0, 2500)}`;
    return {
      tier: 3,
      name: `Wikipedia: ${p.title}`,
      url: p.fullurl ?? `https://en.wikipedia.org/?curid=${p.pageid}`,
      fetchedAt,
      content,
      contentHash: createHash("sha256").update(content).digest("hex"),
    };
  });
}
