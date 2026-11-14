import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

const API = "https://api.tavily.com/search";
const EXCERPT = 2500;

/** Words from the claim worth matching against page text. */
const keyTerms = (claim: string) =>
  [...new Set(claim.toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];

/** The ~EXCERPT-char window of the page that mentions the most claim terms (falls back to the start). */
function bestExcerpt(page: string, claim: string): string {
  const text = page.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= EXCERPT) return text;
  const terms = keyTerms(claim);
  let best = 0, bestScore = -1;
  for (let s = 0; s < text.length; s = text.indexOf("\n\n", s) + 2) {
    const win = text.slice(s, s + EXCERPT).toLowerCase();
    const score = terms.reduce((n, t) => n + (win.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = s; }
    if (text.indexOf("\n\n", s) < 0) break;
  }
  return text.slice(best, best + EXCERPT);
}

/** Tier 3 (secondary): top web search results for the claim with page text. Needs TAVILY_API_KEY; silently skipped without it. */
export async function fetchTavily(claim: string, limit = 3): Promise<Evidence[]> {
  if (!cfg.tavilyKey) return [];
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.tavilyKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: claim.slice(0, 400), max_results: limit, search_depth: "basic", include_raw_content: "markdown" }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Tavily search failed: ${res.status} ${body.slice(0, 200)}`);
  const hits = (JSON.parse(body).results ?? []) as { url: string; title?: string; content?: string; raw_content?: string | null }[];
  const fetchedAt = new Date().toISOString();

  return hits.filter((h) => h.url && (h.raw_content || h.content)).map((h): Evidence => {
    const title = h.title?.trim() || h.url;
    const content = `${title}\n${bestExcerpt(h.raw_content || h.content || "", claim)}`;
    return {
      tier: 3,
      name: `Web: ${title}`,
      url: h.url,
      fetchedAt,
      content,
      contentHash: createHash("sha256").update(content).digest("hex"),
    };
  });
}
