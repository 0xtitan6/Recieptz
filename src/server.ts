// Lookup site: shows a receipt next to its live on-chain run, and checks the receipt against the on-chain CID.
// Run: npm run serve   (PORT defaults to 3000)
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { cfg } from "./config.js";
import { receiptCid } from "./near.js";
import type { Receipt } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);
const DIR = "receipts";

type Status = "Pending" | "Abandoned" | { Verdict: string } | { Late: string };
interface Run {
  id: string; claim_post_id: string; claim_hash: string; jury_config: string;
  registered_at_ms: number; status: Status; receipt_cid: string | null; verdict_at_ms: number | null;
}

/** View call over plain JSON-RPC: no keys needed. */
async function view<T>(method: string, args: object): Promise<T> {
  const res = await fetch(cfg.near.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "lookup", method: "query",
      params: {
        request_type: "call_function", finality: "final", account_id: cfg.near.contractId,
        method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const j = await res.json() as { result?: { result: number[] }; error?: unknown };
  if (!j.result) throw new Error(`RPC error: ${JSON.stringify(j.error)}`);
  return JSON.parse(Buffer.from(j.result.result).toString());
}

/** Find a receipt file by run ID or receipt code. Returns the exact saved bytes. */
function findReceipt(key: string): { bytes: Uint8Array; receipt: Receipt } | null {
  if (!existsSync(DIR)) return null;
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    const bytes = readFileSync(`${DIR}/${f}`);
    const r = JSON.parse(bytes.toString()) as Receipt;
    if (r.runId === key || r.code === key) return { bytes, receipt: r };
  }
  return null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function statusText(s: Status): { label: string; note: string; tone: string } {
  if (s === "Pending") return { label: "Pending", note: "Jury still deliberating.", tone: "muted" };
  if (s === "Abandoned") return { label: "Abandoned", note: "No verdict before the timeout. This run counts against us.", tone: "bad" };
  if ("Late" in s) return { label: s.Late, note: "Verdict arrived after the timeout (late).", tone: "warn" };
  return { label: s.Verdict, note: "Verdict submitted on time.", tone: "ok" };
}

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--bg:#fafaf8;--fg:#1a1a1a;--muted:#6b6b6b;--line:#e3e3df;--card:#fff;--ok:#1e7a46;--bad:#b3261e;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--muted:#9a9a9a;--line:#2c2c2c;--card:#1c1c1c;--ok:#5cc28a;--bad:#f2867e;--warn:#e0b450}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0 0 4px}a{color:inherit}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}
.big{font-size:28px;font-weight:700}.muted{color:var(--muted)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
code{font-size:13px;word-break:break-all}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0}dt{color:var(--muted)}
input{font:inherit;padding:8px 10px;width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}
details summary{cursor:pointer}pre{white-space:pre-wrap;font-size:13px}
</style></head><body><main><p><a href="/"><b>Receiptz</b></a> <span class="muted">· fact checks with on-chain receipts</span></p>${body}</main></body></html>`;

async function runPage(key: string): Promise<{ code: number; html: string }> {
  const found = findReceipt(key);
  const runId = found?.receipt.runId ?? key;
  const run = await view<Run | null>("get_run", { run_id: runId });
  if (!run && !found) return { code: 404, html: page("Not found", `<h1>No run or receipt for <code>${esc(key)}</code></h1>`) };

  let body = "";
  if (found) {
    const r = found.receipt;
    body += `<h1>“${esc(r.claimText)}”</h1>`;
  }
  if (run) {
    const st = statusText(run.status);
    const fileCid = found ? await receiptCid(found.bytes) : null;
    const match = fileCid && run.receipt_cid ? fileCid === run.receipt_cid : null;
    body += `<div class="card"><div class="big ${st.tone}">${esc(st.label)}</div><div class="muted">${esc(st.note)}</div>
<p>${match === true ? `<span class="ok">✓ This receipt matches the CID recorded on-chain.</span>`
      : match === false ? `<span class="bad">✗ This receipt does NOT match the on-chain CID.</span>`
      : `<span class="muted">No receipt to compare yet.</span>`}</p>
<dl><dt>Run</dt><dd><code>${esc(run.id)}</code></dd>
<dt>Contract</dt><dd><a href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}"><code>${esc(cfg.near.contractId)}</code></a></dd>
<dt>Registered</dt><dd>${new Date(run.registered_at_ms).toISOString()}</dd>
<dt>Verdict at</dt><dd>${run.verdict_at_ms ? new Date(run.verdict_at_ms).toISOString() : "—"}</dd>
<dt>Receipt CID</dt><dd><code>${esc(run.receipt_cid ?? "—")}</code></dd>
<dt>Jury</dt><dd><code>${esc(run.jury_config)}</code></dd></dl></div>`;
  } else {
    body += `<div class="card bad">Receipt exists but no on-chain run was found for it.</div>`;
  }
  if (found) {
    const r = found.receipt;
    body += `<div class="card"><b>Sources</b><ul>${r.evidence.map((e) =>
      `<li><a href="${esc(e.url)}">${esc(e.name)}</a> <span class="muted">· tier ${e.tier} · fetched ${esc(e.fetchedAt)}</span></li>`).join("")}</ul></div>
<div class="card"><b>Jurors</b>${r.votes.map((v) =>
      `<p><b>${esc(v.label)}</b> <span class="muted">(${v.confidence.toFixed(2)}) · ${esc(v.modelId)} · ${esc(v.lab)}</span><br>${esc(v.reasoning)}</p>`).join("")}
${r.redTeam ? `<p><b>Red team:</b> ${r.redTeam.overturn ? "overturn" : "upheld"}. ${esc(r.redTeam.reason)}</p>` : ""}
<p><b>Auditor:</b> ${r.auditor.ok ? "passed" : "flagged: " + esc(r.auditor.problems.join("; "))}</p></div>
<p><a href="/run/${esc(r.runId)}.json">Raw receipt JSON</a> <span class="muted">(hash these bytes to get the CID)</span></p>`;
  }
  return { code: 200, html: page(found?.receipt.claimText ?? runId, body) };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const q = url.searchParams.get("q")?.trim();
    if (url.pathname === "/" && q) { res.writeHead(302, { location: `/run/${encodeURIComponent(q)}` }); return res.end(); }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page("Receiptz", `<h1>Look up a receipt</h1><p class="muted">Enter a run ID or receipt code from a Receiptz reply.</p>
<form><input name="q" placeholder="e.g. R-0A64 or b4904146-…" autofocus></form>`));
    }
    const m = url.pathname.match(/^\/run\/([^/]+?)(\.json)?$/);
    if (m) {
      const key = decodeURIComponent(m[1]);
      if (m[2]) {
        const f = findReceipt(key);
        res.writeHead(f ? 200 : 404, { "content-type": "application/json" });
        return res.end(f ? f.bytes : "{}");
      }
      const { code, html } = await runPage(key);
      res.writeHead(code, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    res.writeHead(404).end("not found");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" }).end(`error: ${(e as Error).message}`);
  }
}).listen(PORT, () => console.log(`lookup site on http://localhost:${PORT}`));
