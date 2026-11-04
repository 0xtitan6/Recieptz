import { createHash } from "node:crypto";
import { cfg } from "../config.js";
import type { Evidence } from "../types.js";

// One entry per (table, line). Verify codes with GetParameterValues (see notes).
const TABLES = [
  { table: "T10101", freq: "Q", line: "1", name: "Real GDP, % change from preceding period" },
  { table: "T10105", freq: "Q", line: "1", name: "Gross domestic product, current dollars" },
  { table: "T20600", freq: "M", line: "1", name: "Personal income" },
];

const BASE = "https://apps.bea.gov/api/data";

async function fetchTable(t: (typeof TABLES)[number]): Promise<Evidence> {
  const year = new Date().getFullYear();

  // Public, key-free version of the request: safe to store in the receipt.
  const publicParams = new URLSearchParams({
    method: "GetData",
    datasetname: "NIPA",
    TableName: t.table,
    Frequency: t.freq,
    Year: `${year - 1},${year}`,
    ResultFormat: "JSON",
  });
  const publicUrl = `${BASE}?${publicParams}`;

  // Real request adds the key. Never store or log this URL.
  const res = await fetch(`${publicUrl}&UserID=${encodeURIComponent(cfg.beaKey)}`);
  if (!res.ok) throw new Error(`BEA ${t.table} failed: ${res.status}`);
  const fetchedAt = new Date().toISOString();
  const json = JSON.parse(await res.text());

  // BEA reports errors inside a 200 response.
  const apiErr = json.BEAAPI?.Error ?? json.BEAAPI?.Results?.Error;
  if (apiErr) throw new Error(`BEA ${t.table} error: ${JSON.stringify(apiErr)}`);

  const data: any[] = json.BEAAPI?.Results?.Data ?? [];
  const rows = data
    .filter((d) => String(d.LineNumber) === t.line)
    .sort((a, b) => String(b.TimePeriod).localeCompare(String(a.TimePeriod))) // newest first
    .slice(0, 6);
  if (rows.length === 0) throw new Error(`BEA ${t.table} line ${t.line}: no rows`);

  const unit = rows[0].CL_UNIT ?? "";
  const metric = rows[0].METRIC_NAME ?? "";
  const lines = rows.map((d) => `${d.TimePeriod}: ${d.DataValue}`).join("\n");

  // Hash only Results, not the echoed Request (which contains the UserID).
  const contentHash = createHash("sha256")
    .update(JSON.stringify(json.BEAAPI.Results))
    .digest("hex");

  return {
    tier: 1,
    name: `BEA ${t.name}`,
    url: publicUrl,
    fetchedAt,
    content: `${t.name} [${metric}; ${unit}] (latest first)\n${lines}`,
    contentHash,
  };
}

export async function fetchBea(): Promise<Evidence[]> {
  return Promise.all(TABLES.map(fetchTable));
}