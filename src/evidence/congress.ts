import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

const HOUSE = "House of Representatives";
const SENATE = "Senate";

/** Congress that is sitting on this date. A new Congress begins on January 3 of each odd year. */
export function congressNumber(d = new Date()): number {
  const year = d.getMonth() === 0 && d.getDate() < 3 ? d.getFullYear() - 1 : d.getFullYear();
  return Math.floor((year - 1789) / 2) + 1;
}

function termList(member: any): any[] {
  const item = member?.terms?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function chambersOf(member: any, congress: number): string[] {
  const found = new Set<string>();
  const start = 1789 + (congress - 1) * 2;
  for (const t of termList(member)) {
    if (Number(t.congress) === congress && t.chamber) found.add(String(t.chamber));
    else if (t.chamber && t.startYear && t.endYear) {
      const a = Number(t.startYear);
      const b = Number(t.endYear);
      if (a <= start + 1 && b >= start) found.add(String(t.chamber));
    }
  }
  if (found.size > 0) return [...found];
  if (member.district !== undefined && member.district !== null) return [HOUSE];
  if (member.state) return [SENATE];
  return [];
}

function majority(counts: Record<string, number>): string {
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return "none counted";
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return "no single-party majority";
  return ranked[0][0];
}

function formatChamber(name: string, counts: Record<string, number>): string {
  const lines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([party, n]) => `${party}: ${n}`);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return [`${name} (${total} members)`, ...lines, `Largest party: ${majority(counts)}`].join("\n");
}

export async function fetchCongressMajority(): Promise<Evidence[]> {
  if (!cfg.congressKey) {
    throw new Error("CONGRESS_API_KEY is not set. Sign up at https://api.congress.gov/sign-up/ and add it to .env");
  }
  const congress = congressNumber();
  const publicUrl = `https://api.congress.gov/v3/member/congress/${congress}?currentMember=true&format=json`;
  const members: any[] = [];
  const rawPages: string[] = [];

  for (let offset = 0; offset <= 2000; offset += 250) {
    const url = new URL(`https://api.congress.gov/v3/member/congress/${congress}`);
    url.searchParams.set("currentMember", "true");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "250");
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url, { headers: { Accept: "application/json", "X-API-Key": cfg.congressKey } });
    const body = await res.text();
    if (!res.ok) throw new Error(`Congress.gov failed: ${res.status} ${body.slice(0, 180)}`);
    rawPages.push(body);
    const page = JSON.parse(body).members ?? [];
    members.push(...page);
    if (page.length < 250) break;
  }
  if (members.length === 0) throw new Error(`Congress.gov returned no members for Congress ${congress}`);

  const counts: Record<string, Record<string, number>> = { [HOUSE]: {}, [SENATE]: {} };
  for (const m of members) {
    const party = String(m.partyName ?? "Unknown");
    for (const chamber of chambersOf(m, congress)) {
      if (!counts[chamber]) counts[chamber] = {};
      counts[chamber][party] = (counts[chamber][party] ?? 0) + 1;
    }
  }

  const houseTotal = Object.values(counts[HOUSE]).reduce((s, n) => s + n, 0);
  const senateTotal = Object.values(counts[SENATE]).reduce((s, n) => s + n, 0);
  const warning = houseTotal < 400 || senateTotal < 90
    ? "\nWARNING: Congress.gov returned fewer members than a full chamber. A majority computed from this short list is incomplete."
    : "";
  const content =
    `Party counts for the ${congress}th Congress. partyName values are not combined (Independents stay separate).${warning}\n\n` +
    `${formatChamber(HOUSE, counts[HOUSE])}\n\n${formatChamber(SENATE, counts[SENATE])}`;

  const fetchedAt = new Date().toISOString();
  const contentHash = createHash("sha256").update(rawPages.join("\n")).digest("hex");
  return [{
    tier: 1,
    name: `Congress.gov party counts, ${congress}th Congress`,
    url: publicUrl,
    fetchedAt,
    content,
    contentHash,
  }];
}
