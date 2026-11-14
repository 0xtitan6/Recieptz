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
:root{--bg:#f8f7f2;--fg:#111110;--dim:#85827a;--line:#dedbd2;--box:#f0eee7;--gold:#a8874f;
--true:#1f6b43;--false:#b4232c;--warn:#a8670d;--muted:#5d5b55;
--paper:#fffdf6;--ink:#17161a;--inkdim:#6d6a63}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}
a{color:inherit}
.mono,.label,.tag,.btn,nav .net,.bar,.kv dt{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
.serif{font-family:"Instrument Serif",Georgia,serif;font-weight:400}
nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:26px 0 22px;border-bottom:1px solid var(--line)}
.brand{font-family:"Instrument Serif",Georgia,serif;font-size:34px;letter-spacing:-.02em;text-decoration:none;line-height:1}
.navr{display:flex;align-items:center;gap:22px}
.net{display:flex;align-items:center;gap:8px;font-size:13px;letter-spacing:.06em;color:var(--dim);text-decoration:none}
.dot{width:7px;height:7px;border-radius:50%;background:var(--true)}
.btn{display:inline-flex;align-items:center;gap:10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;padding:11px 18px;border:1px solid var(--fg);background:transparent;color:var(--fg);cursor:pointer;white-space:nowrap}
.btn.solid{background:var(--fg);color:var(--bg);box-shadow:inset 0 -3px 0 var(--gold)}
.btn:hover{transform:translateY(-1px)}
.bar{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--line);font-size:13px;letter-spacing:.04em}
.tag{display:inline-block;font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:4px 10px;border:1px solid currentColor;white-space:nowrap}
.gold{color:var(--gold)}
.stats{display:flex;gap:48px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid var(--line);font-family:"IBM Plex Mono",monospace;font-size:13px;letter-spacing:.12em;text-transform:uppercase}
.stats b{font-weight:500;margin-left:10px}
.label{font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--fg);margin:0 0 14px}
.label.dim{color:var(--dim);font-size:12px}
.hero{padding:64px 0 44px;border-bottom:1px solid var(--line)}
h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(60px,11vw,150px);line-height:.92;letter-spacing:-.035em;margin:8px 0 28px}
h1 em{color:var(--dim)}
.lede{font-size:20px;max-width:640px;margin:0 0 36px}
.lede em{font-family:"Instrument Serif",Georgia,serif;font-size:23px}
.search{display:flex;max-width:640px;border:1px solid var(--line);background:var(--box);padding:5px}
.search input{flex:1;min-width:0;font:15px "IBM Plex Mono",monospace;letter-spacing:.04em;padding:12px 14px;border:0;background:transparent;color:var(--fg);outline:none}
.search:focus-within{border-color:var(--fg)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--line)}
.step{padding:30px 28px 34px 0}
.step+.step{padding-left:28px;border-left:1px solid var(--line)}
.step h3{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:36px;line-height:1;letter-spacing:-.02em;margin:8px 0 10px}
.step h3 em{color:var(--dim)}
.step p{margin:0;color:var(--muted);font-size:16px}
.section{padding:40px 0}
.sechead{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:22px}
.sechead i{font-family:"Instrument Serif",Georgia,serif;font-size:20px;color:var(--dim)}
.shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:26px}
.mini{display:block;text-decoration:none;color:var(--ink);background:var(--paper);padding:20px 18px 24px;font-family:"IBM Plex Mono",monospace;font-size:12px;transform:rotate(var(--r));transition:.25s cubic-bezier(.2,.8,.2,1);box-shadow:0 1px 0 var(--line),0 14px 30px -18px rgba(40,30,10,.35);
clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),95% 100%,90% calc(100% - 6px),85% 100%,80% calc(100% - 6px),75% 100%,70% calc(100% - 6px),65% 100%,60% calc(100% - 6px),55% 100%,50% calc(100% - 6px),45% 100%,40% calc(100% - 6px),35% 100%,30% calc(100% - 6px),25% 100%,20% calc(100% - 6px),15% 100%,10% calc(100% - 6px),5% 100%,0 calc(100% - 6px))}
.mini:hover{transform:rotate(0) translateY(-6px)}
.mini .h{display:flex;justify-content:space-between;color:var(--inkdim);border-bottom:1px dashed #c9c3b3;padding-bottom:8px;margin-bottom:12px}
.mini .q{font-family:"Instrument Serif",Georgia,serif;font-size:22px;line-height:1.15;margin-bottom:16px}
.mini .v{font-weight:600;letter-spacing:.1em}
.v-true,.c-true{color:var(--true)}.v-false,.c-false{color:var(--false)}.v-warn,.c-warn{color:var(--warn)}.v-muted,.c-muted{color:var(--muted)}
/* receipt page */
.crumbs{padding:40px 0 8px}
.crumbs h1{font-size:clamp(38px,5.5vw,76px);margin:6px 0 0}
.grid{display:grid;grid-template-columns:430px 1fr;gap:44px;align-items:start;padding:28px 0 40px}
.paperwrap{position:sticky;top:20px;filter:drop-shadow(0 26px 34px rgba(60,45,15,.22))}
.paper{position:relative;background:var(--paper);color:var(--ink);font-family:"IBM Plex Mono",monospace;font-size:13px;padding:30px 26px 34px;animation:print 1.4s cubic-bezier(.3,.7,.2,1) both;
background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.016) 0 1px,transparent 1px 3px);
--z:linear-gradient(-45deg,transparent 7px,var(--paper) 0) bottom/14px 14px repeat-x,linear-gradient(45deg,transparent 7px,var(--paper) 0) bottom/14px 14px repeat-x}
.paper::after,.paper::before{content:"";position:absolute;left:0;right:0;height:14px;background:var(--z)}
.paper::after{bottom:-14px}.paper::before{top:-14px;transform:rotate(180deg)}
@keyframes print{from{clip-path:inset(0 0 100% 0);transform:translateY(-30px)}to{clip-path:inset(-20px -20px -20px -20px);transform:none}}
.paper .center{text-align:center}
.paper .logo{font-family:"Instrument Serif",Georgia,serif;font-size:34px;letter-spacing:-.01em;line-height:1}
.paper .small{color:var(--inkdim);font-size:11px;line-height:1.5}
.hr{border:0;border-top:1px dashed #b3ac9a;margin:14px 0}.hr2{border:0;border-top:3px double #b3ac9a;margin:14px 0}
.row{display:flex;justify-content:space-between;gap:10px}
.row span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row b{white-space:nowrap;font-weight:600}
.claimtxt{font-family:"Instrument Serif",Georgia,serif;font-size:24px;line-height:1.15;margin:6px 0}
.total{font-size:19px;font-weight:600;letter-spacing:.08em}
.barcode{display:block;width:100%;height:56px;margin:16px 0 6px}
.stamp{position:absolute;right:34px;bottom:58px;transform:rotate(-14deg);border:4px solid currentColor;border-radius:10px;padding:8px 14px;font-family:Inter,sans-serif;font-weight:800;font-size:24px;letter-spacing:.08em;line-height:1.05;text-align:center;background:rgba(255,253,246,.5);
mix-blend-mode:multiply;opacity:.88;animation:stamp .45s 1.3s cubic-bezier(.2,1.6,.4,1) both;
-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.6'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")}
.stamp small{display:block;font-size:10px;letter-spacing:.2em}
.stamp.ok{color:#1f7a4a}.stamp.bad{color:#c4202c}.stamp.meh{color:#777}
@keyframes stamp{from{opacity:0;transform:rotate(-14deg) scale(2.6)}to{opacity:.88;transform:rotate(-14deg) scale(1)}}
.side{display:flex;flex-direction:column;gap:22px;min-width:0}
.panel{border:1px solid var(--line);background:var(--bg);padding:24px}
.panel.sel{border-color:var(--fg);background:var(--box)}
.vhead{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.ring{--p:0;width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(currentColor calc(var(--p)*1%),var(--line) 0);flex:none;animation:fill 1.2s .3s both}
.ring>div{width:96px;height:96px;border-radius:50%;background:var(--box);display:grid;place-items:center;font:500 18px "IBM Plex Mono",monospace;color:var(--fg)}
@property --p{syntax:"<number>";inherits:false;initial-value:0}
@keyframes fill{from{--p:0}}
.vword{font-family:"Instrument Serif",Georgia,serif;font-size:clamp(64px,9vw,110px);line-height:.85;letter-spacing:-.03em}
.note{color:var(--dim);margin-top:10px;font-size:15px}
.verified{display:flex;gap:14px;align-items:center;margin-top:24px;padding:14px 0 0;border-top:1px solid var(--line)}
.verified .ic{width:30px;height:30px;display:grid;place-items:center;font-weight:700;flex:none;border:1px solid currentColor}
.verified b{color:var(--fg);font-weight:600}.verified small{display:block;color:var(--dim);font-size:14px}
.juror{padding:18px 0;border-top:1px solid var(--line)}.juror:first-of-type{border-top:0;padding-top:4px}
.jh{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px}
.jh b{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:26px;color:var(--fg)}
.jh .mono{font-size:12px;color:var(--dim);margin-left:6px}
.juror p{margin:0;color:var(--muted);font-size:16px}
.meter{height:3px;background:var(--line);margin-top:12px}.meter i{display:block;height:100%;background:currentColor}
.kv{display:grid;grid-template-columns:140px 1fr;gap:12px 18px;margin:0;font-size:14px}
.kv dt{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.12em;padding-top:2px}
.kv dd{margin:0;min-width:0;word-break:break-all;font-family:"IBM Plex Mono",monospace;font-size:13px}
.kv a{color:var(--gold)}
.ev{display:flex;justify-content:space-between;gap:14px;padding:16px 0;border-top:1px solid var(--line);text-decoration:none}
.ev:first-of-type{border-top:0;padding-top:4px}
.ev b{font-weight:500}.ev:hover b{text-decoration:underline}
footer{color:var(--dim);font:13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;padding:28px 0 56px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:20px}
@media (max-width:960px){.grid{grid-template-columns:1fr}.paperwrap{position:relative;top:0;max-width:440px;margin:0 auto;width:100%}}
@media (max-width:700px){.steps{grid-template-columns:1fr}.step,.step+.step{padding:24px 0;border-left:0}.step+.step{border-top:1px solid var(--line)}.navr .net{display:none}.bar span.long{display:none}.search{flex-direction:column}.search .btn{justify-content:center}.kv{grid-template-columns:1fr;gap:2px}.kv dd{margin-bottom:10px}.stats{gap:20px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const vclass = (label: string) =>
  ({ True: "true", False: "false", Misleading: "warn", Unverified: "muted", Contested: "muted", Abandoned: "false", Pending: "muted" } as Record<string, string>)[label] ?? "muted";

/** Deterministic barcode drawn from the CID: same CID, same bars. */
function barcode(seed: string): string {
  let x = 0, bars = "";
  for (let i = 0; i < seed.length && x < 300; i++) {
    const c = seed.charCodeAt(i);
    const w = 1 + (c % 3), gap = 1 + ((c >> 2) % 3);
    bars += `<rect x="${x}" width="${w}" height="56"/>`;
    x += w + gap;
  }
  return `<svg class="barcode" viewBox="0 0 ${x} 56" preserveAspectRatio="none" fill="#17161a">${bars}</svg>`;
}

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="theme-color" content="#f8f7f2">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="/">Receiptz.</a>
<div class="navr"><a class="net" href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}"><span class="dot"></span>NEAR testnet</a>
<a class="btn" href="https://x.com/checkreceiptz">Tag @checkreceiptz →</a></div></nav>
<div class="bar"><span class="tag gold">On-chain</span><span class="long">Contract ${esc(cfg.near.contractId)} · every verdict committed before it's posted.</span></div>
${body}
<footer><span>Receiptz · built on NEAR</span><a href="https://github.com/0xtitan6/Recieptz">Source on GitHub →</a></footer>
</div></body></html>`;

function home(): string {
  const all = allReceipts().map((s) => s.receipt).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recent = all.slice(0, 9);
  return page("Receiptz: receipts, not vibes", `<div class="stats"><span>Receipts<b>${all.length || "—"}</b></span><span>Latest<b class="c-${vclass(all[0]?.verdict ?? "")}">${esc(all[0]?.verdict ?? "—")}</b></span><span>Chain<b>NEAR</b></span></div>
<section class="hero">
<p class="label">Tag · check · receipt</p>
<h1>Receipts, <em>not vibes.</em></h1>
<p class="lede">Tag @checkreceiptz under any claim on X. A jury of AI models checks it against primary sources — and the verdict is <em>sealed on NEAR</em> before anyone sees it.</p>
<form class="search" action="/"><input name="q" placeholder="R-0A64 or run id" aria-label="Run ID or receipt code" autocomplete="off"><button class="btn solid">Verify →</button></form>
</section>
<div class="steps">
<div class="step"><p class="label dim">01 · Commit</p><h3>Locked <em>first.</em></h3><p>The claim and the jury are registered on-chain before a single source is read.</p></div>
<div class="step"><p class="label dim">02 · Judge</p><h3>A jury, <em>not a bot.</em></h3><p>Independent labs vote on official data. A red team attacks the verdict; an auditor checks it.</p></div>
<div class="step"><p class="label dim">03 · Receipt</p><h3>Can't be <em>edited.</em></h3><p>The receipt's hash is sealed on NEAR. Change one byte and the stamp breaks.</p></div>
</div>
${recent.length ? `<section class="section"><div class="sechead"><p class="label" style="margin:0">Latest receipts</p><i>printed &amp; stamped</i></div><div class="shelf">${recent.map((r, i) => `<a class="mini" style="--r:${[-1.5, 1, -0.6, 1.4, -1, 0.7][i % 6]}deg" href="/run/${esc(r.runId)}">
<div class="h"><span>${esc(r.code)}</span><span>${new Date(r.timestamp).toISOString().slice(0, 10)}</span></div>
<div class="q">“${esc(r.claimText)}”</div><div class="row"><span>VERDICT</span><span class="v v-${vclass(r.verdict)}">${esc(r.verdict.toUpperCase())}</span></div></a>`).join("")}</div></section>` : ""}`);
}

async function runPage(key: string): Promise<{ code: number; html: string }> {
  const found = findReceipt(key);
  const runId = found?.receipt.runId ?? key;
  const run = await view<Run | null>("get_run", { run_id: runId });
  if (!run && !found) return { code: 404, html: page("Not found", `<section class="hero"><p class="label">404 · ${esc(key)}</p><h1>No receipt, <em>yet.</em></h1><form class="search" action="/"><input name="q" placeholder="Try another run id or code"><button class="btn solid">Verify →</button></form></section>`) };

  const r = found?.receipt;
  const st = run ? statusInfo(run.status) : { label: r?.verdict ?? "Unknown", note: "No on-chain run found.", tone: "muted" };
  const fileCid = found ? await receiptCid(found.bytes) : null;
  const match = run && fileCid && run.receipt_cid ? fileCid === run.receipt_cid : null;
  const vc = vclass(st.label);
  const pct = r ? Math.round(r.confidence * 100) : 0;
  const stamp = match === true ? `<div class="stamp ok">VERIFIED<small>ON NEAR</small></div>`
    : match === false ? `<div class="stamp bad">TAMPERED<small>CID MISMATCH</small></div>`
    : `<div class="stamp meh">PENDING<small>NO RECEIPT YET</small></div>`;
  const when = r ? new Date(r.timestamp) : run ? new Date(run.registered_at_ms) : null;

  const paper = `<div class="paperwrap"><div class="paper">
<div class="center"><div class="logo">Receiptz.</div><div class="small">fact check · on-chain receipt<br>${esc(cfg.near.contractId)}</div></div>
<hr class="hr">
<div class="row small"><span>RECEIPT</span><span>${esc(r?.code ?? "—")}</span></div>
<div class="row small"><span>DATE</span><span>${when ? when.toISOString().replace("T", " ").slice(0, 19) : "—"}</span></div>
<div class="row small"><span>RUN</span><span>${esc(short(runId, 8))}</span></div>
<hr class="hr">
<div class="small">CLAIM</div><div class="claimtxt">“${esc(r?.claimText ?? "Claim not available")}”</div>
<hr class="hr">
${r ? r.votes.map((v) => `<div class="row"><span>${esc(v.lab.toUpperCase())}</span><b class="v-${vclass(v.label)}">${esc(v.label.toUpperCase())} ${Math.round(v.confidence * 100)}%</b></div>`).join("") : ""}
${r?.redTeam ? `<div class="row"><span>RED TEAM</span><b>${r.redTeam.overturn ? "OVERTURN" : "UPHELD"}</b></div>` : ""}
${r ? `<div class="row"><span>AUDITOR</span><b>${r.auditor.ok ? "PASS" : "FLAG"}</b></div>` : ""}
${r ? `<div class="row small"><span>SOURCES</span><span>${r.evidence.length} primary</span></div>` : ""}
<hr class="hr2">
<div class="row total"><span>VERDICT</span><span class="v-${vc}">${esc(st.label.toUpperCase())}</span></div>
<hr class="hr2">
${barcode(run?.receipt_cid ?? runId)}
<div class="center small" style="word-break:break-all">${esc(run?.receipt_cid ?? "cid pending")}</div>
<div class="center small" style="margin-top:12px">*** THANK YOU FOR CHECKING ***</div>
${stamp}
</div></div>`;

  let side = `<div class="panel sel"><p class="label dim">Verdict</p><div class="vhead c-${vc}">${r ? `<div class="ring" style="--p:${pct}"><div>${pct}%</div></div>` : ""}
<div><div class="vword">${esc(st.label)}</div><div class="note">${esc(st.note)}</div></div></div>
${match === true ? `<div class="verified c-true"><span class="ic">✓</span><div><b>Receipt verified on NEAR</b><small>This receipt hashes to the exact CID sealed on-chain. Not one byte has changed since the verdict.</small></div></div>`
    : match === false ? `<div class="verified c-false"><span class="ic">✗</span><div><b>Receipt does not match</b><small>This file's hash differs from the CID on-chain.</small></div></div>`
    : `<div class="verified c-muted"><span class="ic">…</span><div><b>Nothing to compare yet</b><small>No receipt CID on-chain for this run.</small></div></div>`}</div>`;

  if (r) {
    side += `<div class="panel"><p class="label dim">The jury</p>${r.votes.map((v) => `<div class="juror c-${vclass(v.label)}">
<div class="jh"><span><b>${esc(v.lab)}</b><span class="mono">${esc(v.modelId)}</span></span><span class="tag">${esc(v.label)} · ${Math.round(v.confidence * 100)}%</span></div>
<p>${esc(v.reasoning)}</p><div class="meter"><i style="width:${Math.round(v.confidence * 100)}%"></i></div></div>`).join("")}
${r.redTeam ? `<div class="juror ${r.redTeam.overturn ? "c-warn" : "c-true"}"><div class="jh"><b>Red team</b><span class="tag">${r.redTeam.overturn ? "Overturned" : "Upheld"}</span></div><p>${esc(r.redTeam.reason)}</p></div>` : ""}
<div class="juror ${r.auditor.ok ? "c-true" : "c-false"}"><div class="jh"><b>Auditor</b><span class="tag">${r.auditor.ok ? "Passed" : "Flagged"}</span></div>${r.auditor.ok ? "" : `<p>${esc(r.auditor.problems.join("; "))}</p>`}</div></div>
<div class="panel"><p class="label dim">Evidence</p>${r.evidence.length ? r.evidence.map((e) => `<a class="ev" href="${esc(e.url)}"><div><b>${esc(e.name)} ↗</b><div class="note mono" style="font-size:12px;margin-top:2px">FETCHED ${esc(fmt(e.fetchedAt).toUpperCase())}</div></div><span class="tag gold">Tier ${e.tier}</span></a>`).join("") : `<span class="note">No primary record found.</span>`}</div>`;
  }
  if (run) {
    side += `<div class="panel"><p class="label dim">On-chain record</p><dl class="kv">
<dt>Run</dt><dd>${esc(run.id)}</dd>
<dt>Registered</dt><dd>${esc(fmt(run.registered_at_ms))}</dd>
<dt>Verdict at</dt><dd>${run.verdict_at_ms ? esc(fmt(run.verdict_at_ms)) : "—"}</dd>
<dt>Receipt CID</dt><dd>${esc(run.receipt_cid ?? "—")}</dd>
<dt>Claim hash</dt><dd>${esc(run.claim_hash)}</dd>
<dt>Jury</dt><dd>${esc(run.jury_config.split(",").join(" · "))}</dd>
<dt>Contract</dt><dd><a href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}">${esc(cfg.near.contractId)} ↗</a></dd>
${r ? `<dt>Raw</dt><dd><a href="/run/${esc(r.runId)}.json">receipt.json ↗</a> <span style="color:var(--dim)">hash these bytes → same CID</span></dd>` : ""}
</dl></div>`;
  }
  const head = `<div class="crumbs"><p class="label">${esc(r?.code ?? "Run")} · ${esc(st.label)}</p><h1>${r ? `“${esc(r.claimText)}”` : `Run <em>${esc(short(runId, 8))}</em>`}</h1></div>`;
  return { code: 200, html: page(r ? `${st.label}: ${r.claimText}` : `Run ${runId}`, `${head}<div class="grid">${paper}<div class="side">${side}</div></div>`) };
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
