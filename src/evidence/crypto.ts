import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

const ETH = /^0x[a-fA-F0-9]{40}$/;
const NEAR = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9_-]*[a-z0-9])?)+$/;
const SLUG = /^[a-z0-9-]{1,80}$/;

function formatUnits(raw: bigint, decimals: number, places: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").slice(0, places);
  return `${whole.toString()}.${frac}`;
}

async function getJson(url: string): Promise<{ body: string; json: any }> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Crypto fetch failed: ${res.status} ${body.slice(0, 160)}`);
  return { body, json: JSON.parse(body) };
}

export async function fetchEthBalance(address: string): Promise<Evidence[]> {
  if (!ETH.test(address)) return [];
  const res = await fetch(cfg.ethRpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Ethereum RPC failed: ${res.status} ${body.slice(0, 160)}`);
  const json = JSON.parse(body);
  if (json.error) throw new Error(`Ethereum RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
  const wei = BigInt(json.result);
  const fetchedAt = new Date().toISOString();
  return [{
    tier: 1,
    name: `Ethereum balance ${address}`,
    url: cfg.ethRpc,
    fetchedAt,
    content: `ETH balance of ${address} at the latest block\n${formatUnits(wei, 18, 6)} ETH`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}

export async function fetchNearBalance(account: string): Promise<Evidence[]> {
  const id = account.trim().toLowerCase();
  if (!NEAR.test(id)) return [];
  const res = await fetch("https://rpc.mainnet.near.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "query",
      params: { request_type: "view_account", finality: "final", account_id: id },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`NEAR RPC failed: ${res.status} ${body.slice(0, 160)}`);
  const json = JSON.parse(body);
  if (json.error) return [];
  const amount = BigInt(json.result.amount);
  const fetchedAt = new Date().toISOString();
  return [{
    tier: 1,
    name: `NEAR balance ${id}`,
    url: "https://rpc.mainnet.near.org",
    fetchedAt,
    content:
      `NEAR balance of ${id}\n${formatUnits(amount, 24, 4)} NEAR\n` +
      `Block height: ${json.result.block_height}`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}

let protocols: { slug: string; name: string }[] | null = null;

async function protocolList() {
  if (protocols) return protocols;
  const { json } = await getJson("https://api.llama.fi/protocols");
  const rows = Array.isArray(json) ? json : [];
  protocols = rows
    .filter((p: any) => typeof p.slug === "string")
    .map((p: any) => ({ slug: p.slug as string, name: String(p.name ?? p.slug) }));
  return protocols;
}

export async function fetchProtocolTvl(slug: string): Promise<Evidence[]> {
  const needle = slug.trim().toLowerCase();
  if (!SLUG.test(needle)) return [];
  const list = await protocolList();
  const hit = list.find((p) => p.slug === needle) ?? list.find((p) => p.name.toLowerCase() === needle);
  if (!hit) return [];
  const url = `https://api.llama.fi/tvl/${hit.slug}`;
  const { body, json } = await getJson(url);
  const tvl = Number(json);
  if (!Number.isFinite(tvl)) return [];
  return [{
    tier: 2,
    name: `DefiLlama ${hit.name} TVL`,
    url,
    fetchedAt: new Date().toISOString(),
    content: `${hit.name} (${hit.slug}) total value locked, DefiLlama\n$${Math.round(tvl).toLocaleString("en-US")}`,
    contentHash: createHash("sha256").update(body).digest("hex"),
  }];
}
