import { createHash } from "node:crypto";
import type { Evidence } from "../types.js";

const TICKER = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;

function px(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function pct(latest: number, earlier: number): string {
  if (!earlier) return "n/a";
  const n = ((latest - earlier) / earlier) * 100;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function day(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

export async function fetchQuote(ticker: string): Promise<Evidence[]> {
  const symbol = ticker.trim().toUpperCase().replace(/\./g, "-");
  if (!TICKER.test(symbol)) return [];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Quote failed: ${res.status} ${body.slice(0, 160)}`);
  const chart = JSON.parse(body).chart?.result?.[0];
  const closes: (number | null)[] = chart?.indicators?.quote?.[0]?.close ?? [];
  const stamps: number[] = chart?.timestamp ?? [];
  const points = stamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter((p): p is { t: number; c: number } => typeof p.c === "number");
  if (!chart || points.length < 2) return [];

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const month = points[Math.max(0, points.length - 22)];
  const year = points[0];
  const price = Number(chart.meta?.regularMarketPrice ?? last.c);
  const session = chart.meta?.regularMarketChangePercent;

  const content = [
    `${symbol} ${chart.meta?.fullExchangeName ?? chart.meta?.exchangeName ?? ""} ${chart.meta?.currency ?? ""}`.trim(),
    `Latest price: ${px(price)}`,
    `Change vs previous close: ${typeof session === "number" ? `${session.toFixed(2)}%` : pct(last.c, prev.c)} (previous close ${px(prev.c)} on ${day(prev.t)})`,
    `Since ${day(month.t)} (${px(month.c)}): ${pct(last.c, month.c)}`,
    `Since ${day(year.t)} (${px(year.c)}): ${pct(last.c, year.c)}`,
    "Daily closes from Yahoo Finance. The percent changes are computed from those closes.",
  ].join("\n");

  return [{
    tier: 2,
    name: `Yahoo Finance ${symbol} price`,
    url,
    fetchedAt: new Date().toISOString(),
    content,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}
