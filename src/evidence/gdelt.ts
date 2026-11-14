import { createHash } from "node:crypto";
import type { Evidence } from "../types.js";

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_TERMS = 6; // GDELT rejects long queries, and ANDing many terms finds nothing

const STOPWORDS = new Set((
  "a an and are as at be been being but by can could did do does for from had has have he her his how i if in into is it its " +
  "just more most no not of on or our over she so than that the their them then there these they this those to under up was " +
  "we were what when where which while who whom why will with would you your about after again all also any because before " +
  "between both each few here only other own same some such too very says said claim claims true false really actually"
).split(" "));

/** Claim -> GDELT keyword query: no punctuation, no stopwords, no words under 3 chars, at most MAX_TERMS terms. */
export function gdeltQuery(claim: string): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of claim.replace(/(\d),(\d)/g, "$1$2").split(/[^\p{L}\p{N}]+/u)) {
    const w = raw.toLowerCase();
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    terms.push(w);
    if (terms.length === MAX_TERMS) break;
  }
  return terms.join(" ");
}

/** "20261113T120000Z" -> "2026-11-13" */
const day = (s: string | undefined) => (s && /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "unknown date");

/** Tier 3 (secondary): recent English-language news coverage matching the claim's key terms. No key needed. */
export async function fetchGdelt(claim: string, limit = 5): Promise<Evidence[]> {
  const query = gdeltQuery(claim);
  if (!query) return [];

  const url = new URL(API);
  url.search = new URLSearchParams({
    query: `${query} sourcelang:english`, mode: "ArtList", format: "json",
    maxrecords: String(limit), sort: "HybridRel", timespan: "3months",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await res.text();
  if (res.status === 429 || /limit requests/i.test(body)) throw new Error("GDELT rate-limited (max one request per 5s)");
  if (!res.ok) throw new Error(`GDELT failed: ${res.status} ${body.slice(0, 200)}`);
  if (!body.trim()) return []; // GDELT answers an empty body when nothing matches

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Bad queries come back as 200 with plain-text error messages.
    throw new Error(`GDELT rejected query "${query}": ${body.trim().slice(0, 200)}`);
  }
  const articles = (parsed.articles ?? []) as { url: string; title: string; seendate?: string; domain?: string; sourcecountry?: string }[];
  if (!articles.length) return [];

  const fetchedAt = new Date().toISOString();
  const rows = articles.map((a, i) =>
    `${i + 1}. ${a.title?.trim() || "(untitled)"} | ${a.domain ?? "unknown source"} | ${day(a.seendate)} | ${a.url}`,
  ).join("\n");

  return [{
    tier: 3,
    name: `GDELT news search: ${query}`,
    url: url.toString(),
    fetchedAt,
    content: `Recent news articles (last 3 months, GDELT) matching "${query}". Headlines only, not article text.\n${rows}`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}
