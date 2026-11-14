import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

const API = "https://api.firecrawl.dev/v2/search";
const EXCERPT = 2500;

/** Words from the claim worth matching against page text. */
const keyTerms = (claim: string) =>
  [...new Set(claim.toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];

/** The ~EXCERPT-char window of the page that mentions the most claim terms (falls back to the start). */
function bestExcerpt(markdown: string, claim: string): string {
  const text = markdown.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= EXCERPT) return text;
  const terms = keyTerms(claim);
  const paras = text.split(/\n\n/);
  const starts: number[] = [];
  let pos = 0;
  for (const p of paras) { starts.push(pos); pos += p.length + 2; }
  let best = 0, bestScore = -1;
  for (const s of starts) {
    const win = text.slice(s, s + EXCERPT).toLowerCase();
    const score = terms.reduce((n, t) => n + (win.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return text.slice(best, best + EXCERPT);
}

/** Tier 3 (secondary): top web search results for the claim, scraped to markdown. Needs FIRECRAWL_API_KEY; silently skipped without it. */
export async function fetchFirecrawl(claim: string, limit = 3): Promise<Evidence[]> {
  if (!cfg.firecrawlKey) return [];
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: claim.slice(0, 500), limit, sources: ["web"],
      scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true }, timeout: 25_000,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Firecrawl search failed: ${res.status} ${body.slice(0, 200)}`);
  const parsed = JSON.parse(body);
  if (parsed.success === false) throw new Error(`Firecrawl search failed: ${parsed.error ?? "unknown error"}`);
  const hits = (parsed.data?.web ?? []) as { url: string; title?: string; description?: string; markdown?: string | null }[];
  const fetchedAt = new Date().toISOString();

  return hits.filter((h) => h.url && (h.markdown || h.description)).map((h): Evidence => {
    const title = h.title?.trim() || h.url;
    const content = `${title}\n${bestExcerpt(h.markdown || h.description || "", claim)}`;
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
