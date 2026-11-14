import { createHash } from "node:crypto";
import type { Evidence } from "../types.js";

/** Tier 2 (market aggregator): live snapshot of the top coins by market cap. No key needed. */
export async function fetchCrypto(): Promise<Evidence[]> {
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&price_change_percentage=24h,7d";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.text();
  if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
  const coins = JSON.parse(body) as any[];
  const fetchedAt = new Date().toISOString();
  const usd = (n: number | null) => (n == null ? "n/a" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 })}`);
  const pct = (n: number | null | undefined) => (n == null ? "n/a" : `${n.toFixed(2)}%`);

  const rows = coins.map((c) =>
    `#${c.market_cap_rank} ${c.name} (${String(c.symbol).toUpperCase()}): price ${usd(c.current_price)}, market cap ${usd(c.market_cap)}, ` +
    `24h ${pct(c.price_change_percentage_24h_in_currency)}, 7d ${pct(c.price_change_percentage_7d_in_currency)}, ` +
    `all-time high ${usd(c.ath)} on ${String(c.ath_date).slice(0, 10)}, circulating supply ${c.circulating_supply?.toLocaleString("en-US") ?? "n/a"}`,
  ).join("\n");

  return [{
    tier: 2,
    name: "CoinGecko top 30 coins by market cap (live)",
    url: "https://www.coingecko.com/",
    fetchedAt,
    content: `Crypto market snapshot at ${fetchedAt} (USD)\n${rows}`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}
