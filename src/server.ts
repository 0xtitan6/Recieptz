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
:root{--bg:#07070a;--fg:#f2f2ee;--dim:#8b8b93;--line:#1d1d24;--panel:#0f0f14;--panel2:#14141b;
--acid:#c6ff3d;--true:#3dff9a;--false:#ff4d5e;--warn:#ffb020;--muted:#a3a3b5;
--paper:#f3efe4;--ink:#17161a;--inkdim:#6d6a63}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 "Space Grotesk",ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
background:radial-gradient(900px 500px at 15% -10%,rgba(198,255,61,.13),transparent 60%),radial-gradient(700px 500px at 100% 10%,rgba(120,90,255,.12),transparent 60%),
linear-gradient(var(--line) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/48px 48px;
mask-image:linear-gradient(#000 0,#000 40%,transparent 95%);opacity:.9}
.wrap{position:relative;z-index:1;max-width:1120px;margin:0 auto;padding:0 16px}
a{color:inherit}
.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace}
nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0;gap:12px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none}
.mark{width:32px;height:32px;border-radius:9px;background:var(--acid);color:#000;display:grid;place-items:center;font-weight:800;box-shadow:0 0 24px rgba(198,255,61,.45)}
.live{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dim);border:1px solid var(--line);background:rgba(15,15,20,.7);backdrop-filter:blur(8px);border-radius:999px;padding:6px 12px;text-decoration:none}
.dot{width:7px;height:7px;border-radius:50%;background:var(--true);box-shadow:0 0 0 0 rgba(61,255,154,.6);animation:ping 2s infinite}
@keyframes ping{70%{box-shadow:0 0 0 8px rgba(61,255,154,0)}100%{box-shadow:0 0 0 0 rgba(61,255,154,0)}}
.hero{padding:72px 0 40px;text-align:center}
.eyebrow{display:inline-block;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--acid);border:1px solid rgba(198,255,61,.3);border-radius:999px;padding:6px 14px;margin-bottom:26px}
.hero h1{font-size:clamp(48px,10vw,120px);line-height:.9;letter-spacing:-.055em;margin:0 0 24px;font-weight:700}
.hero h1 em{font-style:normal;background:linear-gradient(100deg,var(--acid),#6dffd0 50%,#9d8bff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--dim);font-size:clamp(16px,2.2vw,20px);max-width:620px;margin:0 auto 36px}
.search{display:flex;max-width:620px;margin:0 auto;padding:6px;border-radius:16px;background:var(--panel);border:1px solid var(--line);box-shadow:0 0 0 1px rgba(198,255,61,.0),0 20px 60px -20px rgba(198,255,61,.25);transition:.2s}
.search:focus-within{border-color:rgba(198,255,61,.6);box-shadow:0 0 0 4px rgba(198,255,61,.12),0 20px 60px -20px rgba(198,255,61,.4)}
.search input{flex:1;min-width:0;font:inherit;font-family:"JetBrains Mono",monospace;font-size:15px;padding:14px;border:0;background:transparent;color:var(--fg);outline:none}
.search button{font:inherit;font-weight:700;padding:0 22px;border:0;border-radius:11px;background:var(--acid);color:#000;cursor:pointer;transition:.15s}
.search button:hover{transform:translateY(-1px);box-shadow:0 8px 24px -6px rgba(198,255,61,.6)}
.ticker{margin:56px -16px 0;border-block:1px solid var(--line);overflow:hidden;background:rgba(15,15,20,.6);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
.track{display:flex;gap:40px;width:max-content;padding:14px 0;animation:scroll 40s linear infinite}
.ticker:hover .track{animation-play-state:paused}
@keyframes scroll{to{transform:translateX(-50%)}}
.tick{display:flex;align-items:center;gap:10px;white-space:nowrap;font-size:14px;color:var(--dim);text-decoration:none}
.tick:hover{color:var(--fg)}
.tag{font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;border:1px solid currentColor}
.c-true{color:var(--true)}.c-false{color:var(--false)}.c-warn{color:var(--warn)}.c-muted{color:var(--muted)}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:72px 0}
.step{position:relative;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:18px;padding:22px;overflow:hidden}
.step .n{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--acid)}
.step h3{margin:10px 0 6px;font-size:22px;letter-spacing:-.02em}
.step p{margin:0;color:var(--dim);font-size:15px}
.step::after{content:"";position:absolute;right:-40px;top:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(rgba(198,255,61,.18),transparent 70%)}
.label{font-family:"JetBrains Mono",monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 16px}
.shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:22px;margin-bottom:40px}
.mini{display:block;text-decoration:none;color:var(--ink);background:var(--paper);padding:18px 16px 22px;font-family:"JetBrains Mono",monospace;font-size:12px;transform:rotate(var(--r));transition:.25s cubic-bezier(.2,.8,.2,1);position:relative;
clip-path:polygon(0 0,100% 0,100% calc(100% - 6px),95% 100%,90% calc(100% - 6px),85% 100%,80% calc(100% - 6px),75% 100%,70% calc(100% - 6px),65% 100%,60% calc(100% - 6px),55% 100%,50% calc(100% - 6px),45% 100%,40% calc(100% - 6px),35% 100%,30% calc(100% - 6px),25% 100%,20% calc(100% - 6px),15% 100%,10% calc(100% - 6px),5% 100%,0 calc(100% - 6px))}
.mini:hover{transform:rotate(0) translateY(-6px) scale(1.02)}
.mini .h{display:flex;justify-content:space-between;color:var(--inkdim);border-bottom:1px dashed #bdb7a8;padding-bottom:8px;margin-bottom:10px}
.mini .q{font-family:"Space Grotesk",sans-serif;font-size:16px;font-weight:600;line-height:1.25;margin-bottom:14px}
.mini .v{font-weight:800;font-size:15px;letter-spacing:.08em}
.v-true{color:#0a8a4a}.v-false{color:#d0182b}.v-warn{color:#b26b00}.v-muted{color:#555}
/* receipt page */
.grid{display:grid;grid-template-columns:420px 1fr;gap:40px;align-items:start;padding:24px 0 40px}
.paperwrap{position:sticky;top:20px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.55)) drop-shadow(0 0 60px rgba(198,255,61,.07))}
.paper{position:relative;background:var(--paper);color:var(--ink);font-family:"JetBrains Mono",monospace;font-size:13px;padding:30px 26px 34px;animation:print 1.4s cubic-bezier(.3,.7,.2,1) both;
background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.018) 0 1px,transparent 1px 3px);
--z:linear-gradient(-45deg,transparent 7px,var(--paper) 0) bottom/14px 14px repeat-x,linear-gradient(45deg,transparent 7px,var(--paper) 0) bottom/14px 14px repeat-x}
.paper::after,.paper::before{content:"";position:absolute;left:0;right:0;height:14px;background:var(--z)}
.paper::after{bottom:-14px}
.paper::before{top:-14px;transform:rotate(180deg)}
@keyframes print{from{clip-path:inset(0 0 100% 0);transform:translateY(-30px)}to{clip-path:inset(-20px -20px -20px -20px);transform:none}}
.paper .center{text-align:center}
.paper .logo{font-family:"Space Grotesk",sans-serif;font-weight:800;font-size:26px;letter-spacing:.12em}
.paper .small{color:var(--inkdim);font-size:11px;line-height:1.5}
.hr{border:0;border-top:1px dashed #a9a291;margin:14px 0}
.hr2{border:0;border-top:3px double #a9a291;margin:14px 0}
.row{display:flex;justify-content:space-between;gap:10px}
.row span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row b{white-space:nowrap}
.claimtxt{font-family:"Space Grotesk",sans-serif;font-size:18px;font-weight:600;line-height:1.3;margin:6px 0}
.total{font-size:20px;font-weight:800;letter-spacing:.06em}
.barcode{display:block;width:100%;height:56px;margin:16px 0 6px}
.stamp{position:absolute;right:34px;bottom:58px;transform:rotate(-14deg);border:4px solid currentColor;border-radius:10px;padding:8px 14px;font-family:"Space Grotesk",sans-serif;font-weight:800;font-size:24px;letter-spacing:.08em;line-height:1.05;background:rgba(243,239,228,.55);text-align:center;
mix-blend-mode:multiply;opacity:.88;animation:stamp .45s 1.3s cubic-bezier(.2,1.6,.4,1) both;
-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.6'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E")}
.stamp small{display:block;font-size:10px;letter-spacing:.2em}
.stamp.ok{color:#0a8a4a}.stamp.bad{color:#d0182b}.stamp.meh{color:#777}
@keyframes stamp{from{opacity:0;transform:rotate(-14deg) scale(2.6)}to{opacity:.88;transform:rotate(-14deg) scale(1)}}
.side{display:flex;flex-direction:column;gap:18px;min-width:0}
.panel{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:20px;padding:24px}
.vhead{display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.ring{--p:0;width:112px;height:112px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(currentColor calc(var(--p)*1%),#22222b 0);flex:none;animation:fill 1.2s .3s both}
.ring>div{width:92px;height:92px;border-radius:50%;background:var(--panel);display:grid;place-items:center;font-size:24px;font-weight:700;color:var(--fg)}
@property --p{syntax:"<number>";inherits:false;initial-value:0}
@keyframes fill{from{--p:0}}
.vword{font-size:clamp(44px,7vw,76px);font-weight:700;letter-spacing:-.05em;line-height:.9;text-shadow:0 0 40px currentColor}
.note{color:var(--dim);margin-top:8px}
.verified{display:flex;gap:14px;align-items:center;margin-top:22px;padding:14px 16px;border-radius:14px;border:1px solid}
.verified.ok{border-color:rgba(61,255,154,.35);background:rgba(61,255,154,.07)}
.verified.bad{border-color:rgba(255,77,94,.4);background:rgba(255,77,94,.08)}
.verified.meh{border-color:var(--line)}
.verified .ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;flex:none}
.verified.ok .ic{background:var(--true);color:#000}.verified.bad .ic{background:var(--false);color:#000}.verified.meh .ic{background:#22222b}
.verified small{display:block;color:var(--dim)}
.juror{padding:16px 0;border-top:1px solid var(--line)}.juror:first-of-type{border-top:0;padding-top:4px}
.jh{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px}
.jh b{font-size:17px}.jh .mono{font-size:12px;color:var(--dim)}
.juror p{margin:0;color:#c9c9d1;font-size:15px}
.bar{height:4px;background:#22222b;border-radius:9px;margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;background:currentColor;border-radius:9px}
.kv{display:grid;grid-template-columns:120px 1fr;gap:12px 16px;font-size:14px}
.kv dt{color:var(--dim);font-family:"JetBrains Mono",monospace;font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding-top:2px}
.kv dd{margin:0;min-width:0;word-break:break-all;font-family:"JetBrains Mono",monospace;font-size:13px}
.kv a{color:var(--acid)}
.ev{display:flex;justify-content:space-between;gap:14px;padding:14px 0;border-top:1px solid var(--line);text-decoration:none}
.ev:first-of-type{border-top:0;padding-top:4px}.ev:hover b{color:var(--acid)}
.tier{font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--acid);border:1px solid rgba(198,255,61,.3);border-radius:6px;padding:2px 7px;white-space:nowrap;height:fit-content}
footer{color:var(--dim);font-size:13px;padding:40px 0 60px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:40px}
@media (max-width:900px){.grid{grid-template-columns:1fr}.paperwrap{position:relative;top:0;max-width:440px;margin:0 auto;width:100%}}
@media (max-width:640px){.steps{grid-template-columns:1fr}.hero{padding-top:40px}.search{flex-direction:column}.search button{padding:14px}.kv{grid-template-columns:1fr;gap:2px}.kv dd{margin-bottom:10px}.live span.cid{display:none}}
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
<meta name="theme-color" content="#07070a">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="wrap">
<nav><a class="brand" href="/"><span class="mark">R</span>receiptz</a>
<a class="live" href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}"><span class="dot"></span>NEAR testnet <span class="cid mono">· ${esc(cfg.near.contractId)}</span></a></nav>
${body}
<footer><span>Verdicts are committed on NEAR before they're posted.</span><a href="https://github.com/0xtitan6/Recieptz">github ↗</a></footer>
</div></body></html>`;

function home(): string {
  const recent = allReceipts().map((s) => s.receipt)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12);
  const ticks = recent.map((r) => `<a class="tick" href="/run/${esc(r.runId)}"><span class="tag c-${vclass(r.verdict)}">${esc(r.verdict)}</span>${esc(r.claimText)}</a>`).join("");
  return page("Receiptz: receipts, not vibes", `<section class="hero">
<span class="eyebrow">AI fact checks · locked on NEAR</span>
<h1>Receipts,<br><em>not vibes.</em></h1>
<p>Tag <b>@checkreceiptz</b> under any claim on X. A jury of AI models checks it against primary sources, and the verdict is sealed on-chain before anyone sees it.</p>
<form class="search" action="/"><input name="q" placeholder="R-0A64 or run id…" aria-label="Run ID or receipt code" autocomplete="off"><button>Verify →</button></form>
</section>
${recent.length ? `<div class="ticker"><div class="track">${ticks}${ticks}</div></div>` : ""}
<div class="steps">
<div class="step"><span class="n">01 / COMMIT</span><h3>Locked first.</h3><p>The claim and the jury are registered on NEAR before a single source is read.</p></div>
<div class="step"><span class="n">02 / JUDGE</span><h3>Jury of models.</h3><p>Independent labs vote on official data. A red team attacks it, an auditor checks it.</p></div>
<div class="step"><span class="n">03 / RECEIPT</span><h3>Can't be edited.</h3><p>The receipt's hash is sealed on-chain. Change one byte and the stamp breaks.</p></div>
</div>
${recent.length ? `<p class="label">// latest receipts</p><div class="shelf">${recent.map((r, i) => `<a class="mini" style="--r:${[-2, 1.5, -1, 2, -1.5, 1][i % 6]}deg" href="/run/${esc(r.runId)}">
<div class="h"><span>${esc(r.code)}</span><span>${new Date(r.timestamp).toISOString().slice(0, 10)}</span></div>
<div class="q">“${esc(r.claimText)}”</div><div class="row"><span>VERDICT</span><span class="v v-${vclass(r.verdict)}">${esc(r.verdict.toUpperCase())}</span></div></a>`).join("")}</div>` : ""}`);
}

async function runPage(key: string): Promise<{ code: number; html: string }> {
  const found = findReceipt(key);
  const runId = found?.receipt.runId ?? key;
  const run = await view<Run | null>("get_run", { run_id: runId });
  if (!run && !found) return { code: 404, html: page("Not found", `<section class="hero"><span class="eyebrow">404</span><h1>No receipt.</h1><p>Nothing matches <span class="mono">${esc(key)}</span>.</p><form class="search" action="/"><input name="q" placeholder="Try another run id or code"><button>Verify →</button></form></section>`) };

  const r = found?.receipt;
  const st = run ? statusInfo(run.status) : { label: r?.verdict ?? "Unknown", note: "No on-chain run found.", tone: "muted" };
  const fileCid = found ? await receiptCid(found.bytes) : null;
  const match = run && fileCid && run.receipt_cid ? fileCid === run.receipt_cid : null;
  const vc = vclass(st.label);
  const pct = r ? Math.round(r.confidence * 100) : 0;
  const stamp = match === true ? `<div class="stamp ok">VERIFIED<small>ON NEAR</small></div>`
    : match === false ? `<div class="stamp bad">TAMPERED<small>CID MISMATCH</small></div>`
    : `<div class="stamp meh">PENDING<small>NO RECEIPT YET</small></div>`;

  const paper = `<div class="paperwrap"><div class="paper">
<div class="center"><div class="logo">RECEIPTZ</div><div class="small">fact check · on-chain receipt<br>${esc(cfg.near.contractId)}</div></div>
<hr class="hr">
<div class="row small"><span>RECEIPT</span><span>${esc(r?.code ?? "—")}</span></div>
<div class="row small"><span>DATE</span><span>${r ? new Date(r.timestamp).toISOString().replace("T", " ").slice(0, 19) : run ? new Date(run.registered_at_ms).toISOString().replace("T", " ").slice(0, 19) : "—"}</span></div>
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

  let side = `<div class="panel c-${vc}"><div class="vhead">${r ? `<div class="ring" style="--p:${pct}"><div>${pct}%</div></div>` : ""}
<div><div class="vword">${esc(st.label)}</div><div class="note">${esc(st.note)}</div></div></div>
${match === true ? `<div class="verified ok"><span class="ic">✓</span><div><b style="color:var(--fg)">Receipt verified on NEAR</b><small>This receipt hashes to the exact CID sealed on-chain. Not one byte changed since the verdict.</small></div></div>`
    : match === false ? `<div class="verified bad"><span class="ic">✗</span><div><b style="color:var(--fg)">Receipt does not match</b><small>This file's hash differs from the CID on-chain.</small></div></div>`
    : `<div class="verified meh"><span class="ic">…</span><div><b style="color:var(--fg)">Nothing to compare yet</b><small>No receipt CID on-chain for this run.</small></div></div>`}</div>`;

  if (r) {
    side += `<div class="panel"><p class="label">// the jury</p>${r.votes.map((v) => `<div class="juror c-${vclass(v.label)}">
<div class="jh"><span><b style="color:var(--fg)">${esc(v.lab)}</b> <span class="mono">${esc(v.modelId)}</span></span><span class="tag">${esc(v.label)} ${Math.round(v.confidence * 100)}%</span></div>
<p>${esc(v.reasoning)}</p><div class="bar"><i style="width:${Math.round(v.confidence * 100)}%"></i></div></div>`).join("")}
${r.redTeam ? `<div class="juror ${r.redTeam.overturn ? "c-warn" : "c-true"}"><div class="jh"><b style="color:var(--fg)">Red team</b><span class="tag">${r.redTeam.overturn ? "Overturned" : "Upheld"}</span></div><p>${esc(r.redTeam.reason)}</p></div>` : ""}
<div class="juror ${r.auditor.ok ? "c-true" : "c-false"}"><div class="jh"><b style="color:var(--fg)">Auditor</b><span class="tag">${r.auditor.ok ? "Passed" : "Flagged"}</span></div>${r.auditor.ok ? "" : `<p>${esc(r.auditor.problems.join("; "))}</p>`}</div></div>
<div class="panel"><p class="label">// evidence</p>${r.evidence.length ? r.evidence.map((e) => `<a class="ev" href="${esc(e.url)}"><div><b>${esc(e.name)} ↗</b><div class="note mono" style="font-size:12px;margin-top:2px">fetched ${esc(fmt(e.fetchedAt))}</div></div><span class="tier">TIER ${e.tier}</span></a>`).join("") : `<span class="note">No primary record found.</span>`}</div>`;
  }
  if (run) {
    side += `<div class="panel"><p class="label">// on-chain record</p><dl class="kv">
<dt>run</dt><dd>${esc(run.id)}</dd>
<dt>registered</dt><dd>${esc(fmt(run.registered_at_ms))}</dd>
<dt>verdict at</dt><dd>${run.verdict_at_ms ? esc(fmt(run.verdict_at_ms)) : "—"}</dd>
<dt>receipt cid</dt><dd>${esc(run.receipt_cid ?? "—")}</dd>
<dt>claim hash</dt><dd>${esc(run.claim_hash)}</dd>
<dt>jury</dt><dd>${esc(run.jury_config.split(",").join(" · "))}</dd>
<dt>contract</dt><dd><a href="https://testnet.nearblocks.io/address/${esc(cfg.near.contractId)}">${esc(cfg.near.contractId)} ↗</a></dd>
${r ? `<dt>raw</dt><dd><a href="/run/${esc(r.runId)}.json">receipt.json ↗</a> <span style="color:var(--dim)">hash these bytes → same CID</span></dd>` : ""}
</dl></div>`;
  }
  return { code: 200, html: page(r ? `${st.label}: ${r.claimText}` : `Run ${runId}`, `<div class="grid">${paper}<div class="side">${side}</div></div>`) };
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
