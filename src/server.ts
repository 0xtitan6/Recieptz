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

interface Stored { bytes: Uint8Array; receipt: Receipt }
function allReceipts(): Stored[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const bytes = readFileSync(`${DIR}/${f}`);
    return { bytes, receipt: JSON.parse(bytes.toString()) as Receipt };
  });
}
/** Find a receipt by run ID or receipt code. Returns the exact saved bytes. */
const findReceipt = (key: string) => allReceipts().find((s) => s.receipt.runId === key || s.receipt.code === key) ?? null;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (label: string) =>
  ({ True: "true", False: "false", Misleading: "warn", Unverified: "muted", Contested: "muted" } as Record<string, string>)[label] ?? "muted";
const fmt = (ms: number | string) => new Date(ms).toUTCString().replace(" GMT", " UTC");
const short = (s: string, n = 10) => (s.length > 2 * n ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

function statusInfo(s: Status): { label: string; note: string; tone: string } {
  if (s === "Pending") return { label: "Pending", note: "The jury is still deliberating.", tone: "muted" };
  if (s === "Abandoned") return { label: "Abandoned", note: "No verdict before the timeout. This run counts against us.", tone: "false" };
  if ("Late" in s) return { label: s.Late, note: "Verdict arrived after the timeout and is marked late.", tone: "warn" };
  return { label: s.Verdict, note: "Verdict submitted on time.", tone: tone(s.Verdict) };
}

const CSS = `
:root{--bg:#f6f6f3;--fg:#141414;--muted:#6a6a66;--line:#e4e3de;--card:#fff;--chip:#efeee9;
--true:#137a43;--true-bg:#e3f4ea;--false:#b42318;--false-bg:#fde8e6;--warn:#9a6200;--warn-bg:#fdf1d8;--mutedc:#55565c;--muted-bg:#ececef;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#ececec;--muted:#9a9ba1;--line:#25272b;--card:#16171a;--chip:#1f2125;
--true:#5fd394;--true-bg:#12301f;--false:#ff8a80;--false-bg:#3a1513;--warn:#f2c14e;--warn-bg:#352a10;--mutedc:#b4b6bd;--muted-bg:#24262b;--accent:#8ea2ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration-color:var(--line);text-underline-offset:3px}a:hover{text-decoration-color:currentColor}
.wrap{max-width:820px;margin:0 auto;padding:0 16px}
nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em;text-decoration:none}
.logo{width:28px;height:28px;border-radius:8px;background:var(--fg);color:var(--bg);display:grid;place-items:center;font-size:15px}
.net{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px}
.hero{padding:56px 0 32px}
.hero h1{font-size:clamp(32px,6vw,52px);line-height:1.05;letter-spacing:-.03em;margin:0 0 14px}
.hero p{color:var(--muted);font-size:18px;margin:0 0 28px;max-width:560px}
form{display:flex;gap:8px}
input{flex:1;font:inherit;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--fg);outline:none;min-width:0}
input:focus{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent)}
button{font:inherit;font-weight:600;padding:0 20px;border:0;border-radius:12px;background:var(--fg);color:var(--bg);cursor:pointer}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:40px 0}
.step{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.step b{display:block;margin-bottom:4px}.step span{color:var(--muted);font-size:14px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:32px 0 12px;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:0 0 14px}
.list a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 4px;border-top:1px solid var(--line);text-decoration:none}
.list a:first-child{border-top:0}.list a:hover .claim{text-decoration:underline}
.claim{font-weight:500}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
.true{color:var(--true);background:var(--true-bg)}.false{color:var(--false);background:var(--false-bg)}
.warn{color:var(--warn);background:var(--warn-bg)}.muted{color:var(--mutedc);background:var(--muted-bg)}
.quote{font-size:clamp(24px,4.5vw,36px);line-height:1.2;letter-spacing:-.02em;font-weight:650;margin:28px 0 18px}
.verdict{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.big{font-size:28px;font-weight:750;padding:8px 18px;border-radius:12px;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:14px}
.verify{display:flex;gap:12px;align-items:flex-start;border-radius:14px;padding:16px;margin:16px 0 0}
.verify .ic{font-size:20px;line-height:1.2}
.meter{height:6px;border-radius:99px;background:var(--chip);overflow:hidden;margin-top:6px;width:120px}
.meter i{display:block;height:100%;border-radius:99px;background:currentColor}
dl{display:grid;grid-template-columns:max-content 1fr;gap:10px 18px;margin:0;font-size:14px}
dt{color:var(--muted)}dd{margin:0;min-width:0}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--chip);padding:2px 6px;border-radius:6px;word-break:break-all}
.src{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.src:first-of-type{border-top:0}
.tier{font-size:12px;color:var(--muted);white-space:nowrap}
.vote{padding:14px 0;border-top:1px solid var(--line)}.vote:first-of-type{border-top:0}
.vh{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px}
.model{font-size:14px;color:var(--muted)}
.vote p{margin:0;font-size:15px}
footer{color:var(--muted);font-size:13px;padding:40px 0 56px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media (max-width:600px){.steps{grid-template-columns:1fr}form{flex-direction:column}button{padding:14px}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:10px}}
`;

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="/"><span class="logo">✓</span>Receiptz</a><span class="net">NEAR testnet · <a href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}">${esc(cfg.near.contractId)}</a></span></nav>
${body}
<footer><span>Every verdict is committed on NEAR before it's posted.</span><a href="https://github.com/0xtitan6/Recieptz">Source on GitHub</a></footer>
</div></body></html>`;

function home(): string {
  const recent = allReceipts().map((s) => s.receipt)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
  return page("Receiptz", `<section class="hero">
<h1>Fact checks you<br>don't have to trust.</h1>
<p>Tag @checkreceiptz under a claim on X. A jury of AI models checks it against primary sources, and the verdict is locked on NEAR before anyone sees it.</p>
<form action="/"><input name="q" placeholder="Run ID or receipt code, e.g. R-0A64" aria-label="Run ID or receipt code"><button>Look up</button></form>
</section>
<div class="steps">
<div class="step"><b>1 · Committed</b><span>The claim and jury are registered on-chain before any evidence is read.</span></div>
<div class="step"><b>2 · Judged</b><span>Independent models vote on official data; a red team and auditor check them.</span></div>
<div class="step"><b>3 · Receipted</b><span>The full receipt's hash is recorded on NEAR, so it can't be edited later.</span></div>
</div>
${recent.length ? `<h2>Recent receipts</h2><div class="card list">${recent.map((r) =>
    `<a href="/run/${esc(r.runId)}"><span><span class="claim">${esc(r.claimText)}</span><br><span class="sub">${esc(r.code)} · ${fmt(r.timestamp)}</span></span><span class="pill ${tone(r.verdict)}">${esc(r.verdict)}</span></a>`).join("")}</div>` : ""}`);
}

async function runPage(key: string): Promise<{ code: number; html: string }> {
  const found = findReceipt(key);
  const runId = found?.receipt.runId ?? key;
  const run = await view<Run | null>("get_run", { run_id: runId });
  if (!run && !found) return { code: 404, html: page("Not found", `<section class="hero"><h1>Nothing here.</h1><p>No run or receipt matches <code>${esc(key)}</code>.</p><form action="/"><input name="q" placeholder="Try another run ID or code"><button>Look up</button></form></section>`) };

  const r = found?.receipt;
  let body = r ? `<div class="quote">“${esc(r.claimText)}”</div>` : `<div class="quote">Run <code>${esc(short(runId))}</code></div>`;

  if (run) {
    const st = statusInfo(run.status);
    const fileCid = found ? await receiptCid(found.bytes) : null;
    const match = fileCid && run.receipt_cid ? fileCid === run.receipt_cid : null;
    body += `<div class="card"><div class="verdict"><span class="big ${st.tone}">${esc(st.label)}</span>
<div>${r ? `<div class="sub">Confidence ${(r.confidence * 100).toFixed(0)}%</div><div class="meter ${st.tone}" style="background:var(--chip)"><i style="width:${(r.confidence * 100).toFixed(0)}%"></i></div>` : ""}
<div class="sub" style="margin-top:6px">${esc(st.note)}</div></div></div>
${match === true ? `<div class="verify true"><span class="ic">✓</span><div><b>Receipt verified on NEAR.</b><br><span style="font-size:14px">This receipt hashes to the exact CID recorded on-chain. It hasn't been changed since the verdict.</span></div></div>`
      : match === false ? `<div class="verify false"><span class="ic">✗</span><div><b>Receipt does not match.</b><br><span style="font-size:14px">This file's hash differs from the CID on-chain.</span></div></div>`
      : `<div class="verify muted"><span class="ic">…</span><div>No receipt to compare yet.</div></div>`}</div>
<h2>On-chain record</h2><div class="card"><dl>
<dt>Run ID</dt><dd><code>${esc(run.id)}</code></dd>
<dt>Registered</dt><dd>${fmt(run.registered_at_ms)}</dd>
<dt>Verdict at</dt><dd>${run.verdict_at_ms ? fmt(run.verdict_at_ms) : "—"}</dd>
<dt>Receipt CID</dt><dd><code>${esc(run.receipt_cid ?? "—")}</code></dd>
<dt>Claim hash</dt><dd><code>${esc(run.claim_hash)}</code></dd>
<dt>Jury</dt><dd>${run.jury_config.split(",").map((m) => `<code>${esc(m)}</code>`).join(" ")}</dd>
<dt>Contract</dt><dd><a href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}">${esc(cfg.near.contractId)} ↗</a></dd>
</dl></div>`;
  } else {
    body += `<div class="card"><div class="verify false"><span class="ic">!</span><div>This receipt exists, but no matching run was found on-chain.</div></div></div>`;
  }

  if (r) {
    body += `<h2>Evidence</h2><div class="card">${r.evidence.length ? r.evidence.map((e) =>
      `<div class="src"><div><a href="${esc(e.url)}">${esc(e.name)} ↗</a><div class="sub">Fetched ${fmt(e.fetchedAt)}</div></div><span class="tier">Tier ${e.tier}</span></div>`).join("")
      : `<span class="sub">No primary record found.</span>`}</div>
<h2>Jury</h2><div class="card">${r.votes.map((v) =>
      `<div class="vote"><div class="vh"><span><b>${esc(v.lab)}</b> <span class="model">${esc(v.modelId)}</span></span><span class="pill ${tone(v.label)}">${esc(v.label)} · ${(v.confidence * 100).toFixed(0)}%</span></div><p>${esc(v.reasoning)}</p></div>`).join("")}</div>
<h2>Checks</h2><div class="card"><dl>
${r.redTeam ? `<dt>Red team</dt><dd>${r.redTeam.overturn ? `<span class="pill warn">Overturned</span>` : `<span class="pill true">Upheld</span>`} ${esc(r.redTeam.reason)}</dd>` : ""}
<dt>Auditor</dt><dd>${r.auditor.ok ? `<span class="pill true">Passed</span>` : `<span class="pill false">Flagged</span> ${esc(r.auditor.problems.join("; "))}`}</dd>
<dt>Receipt</dt><dd><code>${esc(r.code)}</code> · <a href="/run/${esc(r.runId)}.json">raw JSON ↗</a> <span class="sub">(hash these bytes to reproduce the CID)</span></dd>
</dl></div>`;
  }
  return { code: 200, html: page(r?.claimText ?? `Run ${runId}`, body) };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const q = url.searchParams.get("q")?.trim();
    if (url.pathname === "/" && q) { res.writeHead(302, { location: `/run/${encodeURIComponent(q)}` }); return res.end(); }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(home());
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
