# Receipts — Project Proposal v4
**Oct 2026 · @0xtitan6**

> **Superseded by [README.md](README.md).** This proposal is kept for history. Where they differ (name, handle, domains, verdict rules, appeals, run integrity, scope), the README is current.

> **Don't trust the take. Check the receipts.**

Receipts is a fact-checking agent swarm on NEAR that anyone can tag on X. It checks claims against primary records, judges them with a jury of attested AI models, and posts a public on-chain receipt proving exactly how every verdict was reached — which models judged, which sources they read, what prompt version ran, and a cryptographic proof that no human touched the output.

**Built for:** NEAR HACKATHON, Nov 1–14, 2026.
**Primary track:** AI Swarms. **Fallbacks:** AI Security & Defense, Open Innovation.

---

## The Problem

### Trust in facts is collapsing, and the damage is measurable

71% of Americans now identify disinformation as a major national problem — the highest level ever recorded. For the third consecutive year, more US adults said they had no trust at all in news media (36%) than trusted it a great deal or a fair amount. And the damage is no longer just political: disinformation is estimated to cost the global economy roughly $78 billion per year in direct losses (a widely cited 2019 industry estimate), including $39 billion in stock-market losses from false reports alone.

The consequences of eroded institutional credibility are immediate and quantifiable. When the BLS Commissioner was abruptly fired in August 2025, it triggered a sharp rise in economic policy uncertainty. Economists estimate that the resulting loss of confidence in official statistics may have shaved roughly $20 billion from US GDP — by one estimate, approximately 28× the agency's entire annual budget. That is the cost of a single trust-erosion event in one statistical agency.

### The spread problem is structural, not incidental

False news is not spreading because people are careless. It spreads because the architecture of social platforms rewards it. A 2018 MIT study tracking 126,000 stories on Twitter over a decade found that false news was 70% more likely to be retweeted than true news, and reached 1,500 people approximately six times faster. Falsehoods were also more novel and provoked greater emotional responses — properties the feed algorithm amplifies, not suppresses.

By 2026, roughly 90% of US adults say they encounter inaccurate news at least sometimes, with 42% reporting it happens extremely often or often.

### Existing AI fact-checkers solve the wrong problem

The most widely used AI fact-checker today is Grok — a single model owned by the platform it runs on, with no visible sources, no process transparency, and no audit trail. A December 2025 preprint by Renault, Mosleh, and Rand found that Perplexity and Grok largely aligned with Community Notes decisions on posts rated misleading — but 21% to 28% of posts that Community Notes deemed misleading were rated true by the AI bots. On a sample of 100 posts rated by professional fact-checkers, Grok-3's verdicts agreed with a fact-checker 54.5% of the time, against an inter-fact-checker agreement rate of 64.0%. A separate analysis using 188 posts from the same paper found Grok-3 agreement at 57.9% versus 59.3% between fact-checkers — within the same range, still well below human expert consistency. The problem isn't that these tools are wrong — it's that you have no way to know *why* they reached the verdict they did, who instructed them, or whether the process was steered.

X's Community Notes AI writers — now producing more than 50% of all visible notes — have no published process, no source transparency, and no verifiable receipts. 65% of Americans already hold social media platforms responsible for spreading disinformation; a verdict from a process nobody can inspect is, structurally, just another unverifiable claim.

**What's missing is not better models. It's a provably fair process.**

---

## Solution

Receipts makes the process the product. It doesn't promise the truth. It promises:

- **Which models judged** — model IDs and version hashes, on-chain
- **Which sources they read** — URLs with content hashes at fetch time
- **What instructions they ran under** — prompt version hash, published
- **Proof no human touched the verdict** — TEE attestation signatures from hardware, verified by Intel Trust Authority

Anyone can reply to any post with `@receipts is this true?` and receive a sourced verdict plus a receipt code (e.g. `R-8F2K`) pointing to its permanent on-chain record. The full receipt — sources, juror votes, attestation signatures — lives on NEAR and is searchable from the account's pinned link.

---

## The AI Community Notes Opportunity

Seven months of public Community Notes data (September 2025 through March 2026, across 423,915 notes analyzed by the R Street Institute) show that AI note-writers already outperform average human writers on every measurable metric. R Street introduced the Verdict Success Rate (VSR) — measuring how often a note succeeds when it completes full evaluation — to isolate quality from the platform's rating-capacity constraints:

| Metric | AI Writers | Human Writers |
|---|---|---|
| Verdict Success Rate (VSR) | **88.8%** | 68.5% |
| "Currently Rated Helpful" rate | **18.0%** | 8.9% |
| Ratings needed per successful note | **304** | 908 |
| Monthly output growth (Sep '25 → Feb '26) | **93 → 8,109 notes** | — |

Monthly AI output grew 87-fold in that period, from 93 notes in September 2025 to 8,109 in February 2026. By May 2026, eight AI contributors wrote more than 50% of all visible Community Notes (Indicator.media). Since their introduction, AI writers have helped increase daily "Currently Rated Helpful" note volume by 86.0% across the platform.

The lane is wide open. The AI writer that can prove its sourcing methodology will have a distinct quality signal with raters. Receipts would be the only Community Notes writer whose notes carry a verifiable receipt.

**One constraint:** the Community Notes writer API currently supports notes only on posts rated misleading, so "this checks out" verdicts ship as replies from the account rather than formal notes. Community Notes writer registration is a stretch goal for this hackathon build; account replies are the core distribution path.

---

## User Flow

1. **Tag.** A user replies to any post with `@receipts is this true?`. Separately, scout agents sweep for fast-spreading claims and check them before anyone asks.
2. **Dedupe.** If the claim was already checked, the stored verdict returns instantly from the NEAR contract. No inference cost, no latency.
3. **Extract and triage.** A small model converts the post into specific, checkable claims. Opinions and value questions receive a polite "not a factual claim" reply that presents the strongest case from each side — no verdict is issued. Satire and jokes are classified at this stage before anything is forwarded for a jury.
4. **Gather evidence.** Specialist agents pull primary records for the claim's domain, then layer in context from news outlets across the political spectrum, with the source spread published in every receipt.
5. **Judge.** Three jurors from different model families vote independently. A red team attempts to overturn the draft verdict. Auditors verify every citation. If jurors split, escalate to five; four of five in agreement publishes.
6. **Reply and record.** The agent replies with one of five labels, a confidence level, the top sources by name, and a short receipt code (e.g. `R-8F2K`). The full on-chain receipt — source URLs with content hashes, juror votes, attestation signatures — is written to NEAR and retrievable by code. Replies do not embed a URL to avoid X's $0.20/post-with-link charge; the receipt explorer is linked in the account bio and pinned post.
7. **Update.** When new evidence arrives or a challenge succeeds, the verdict is revised on-chain. The full history remains visible.

**The five labels:** True · False · Misleading · Unverified · Contested (jurors disagree)

The Contested label is not a failure state. On politically charged, rapidly developing, or genuinely ambiguous claims — the exact claims that matter most — a Contested verdict is the correct and honest output. A high Contested rate on contested political topics is expected and desirable behavior.

---

## Swarm Architecture

Five agent roles hand a claim down a pipeline. Only the NEAR smart contract writes the verdict. A staked challenge sends it back for a fresh jury.

```
[X Listener]
     │
     ▼
[Triage Agent] ──────── Opinion/gossip → polite decline
     │                  Satire/joke → "appears satirical" + explanation
     │                  Already checked → stored verdict (dedupe)
     ▼
[Specialist Agents] ── Primary records (Congress.gov / BLS / on-chain)
     │                  News across spectrum (source spread published)
     │                  Social posts (leads only, not evidence)
     ▼
[Jury: 3 Jurors] ──── Independent votes, different model families
     │
[Red Team] ─────────── Attempts to overturn draft verdict with new sources
     │
[Auditors] ─────────── Block any verdict citing a source that doesn't support the claim
     │
[NEAR Contract] ─────── Writes verdict, receipt, challenge stakes, treasury
     │
[X Reply]
```

### Verdict Rules

- Three jurors from different model families vote first. A True, False, or Misleading verdict publishes only if all three agree **and** the red team fails to overturn it.
- If jurors split, escalate to five. Four of five in agreement publishes; anything less is Contested.
- Not enough primary evidence → Unverified, regardless of juror lean.
- Auditors block any verdict citing a source that does not say what is claimed.
- Challenges: anyone stakes against a verdict. A fresh jury re-reviews with new sources. Overturned → challenger wins. Upheld → stake goes to treasury.

### Stake-and-earn incentives

Agents earn when their evidence survives audit and the red team. Agents lose stake for fake or misquoted citations. This creates an internal integrity pressure that is independent of the jury vote.

---

## Evidence Tiers

Primary records decide facts. Everything else is context or a lead.

| Tier | Role | Examples |
|---|---|---|
| **1. Primary records** | Decide factual claims | Voting records, bill text, full transcripts, BLS releases, SEC filings, court dockets, on-chain data |
| **2. News across the spectrum** | Context; disagreement between outlets is reported as information | Outlets from left, center, and right, with source spread published |
| **3. Social (X, Reddit)** | Leads and original footage; tips only | Viral posts, original uploads — never used as evidence |
| **4. Prediction markets** | Odds for forward-looking claims only, shown with volume and liquidity | Polymarket, Kalshi |

**Why this matters:** when AI fact-checkers cite whatever is most searchable — including the ecosystem of the misleading post itself — they launder the original claim into the verdict. Fixing this requires an explicit evidence hierarchy enforced at the agent level, not as a prompt instruction.

The hackathon demo covers three domains with free, clean, well-documented APIs: politics (Congress.gov), economy (BLS), and crypto (on-chain data). The engine is domain-agnostic; adding a domain means adding its primary-record specialist.

**Two non-negotiable rules:**

1. For value questions ("is this policy good?"), the agent presents the policy text, the strongest case from supporters and critics, and independent analysis — but issues no verdict.
2. Receipts never uses a prediction market's own price as evidence when resolving a claim on that market.

---

## Verifiability and the NEAR Stack

### What a receipt records

Every verdict ships a permanent, on-chain receipt containing:
- Post ID and a hash of the claim
- Each source URL with a hash of its content at fetch time
- Juror model IDs and attestation hashes
- Response signatures verified against attestation evidence
- A hash of the prompt version that ran
- Each juror's individual vote
- The final verdict and confidence level
- A timestamp
- The verdict it supersedes, if any

Anyone can load the prompt version, the model IDs, and the sources at their hashed state and verify the output signatures. Two notes on verification scope:

- **LLM outputs are not exactly reproducible** even with identical inputs. What the receipt enables is verification of the inputs, signatures, and attestation — not a byte-for-byte replay.
- **Attestation depth differs by tier.** For NEAR's own fleet (GLM, Qwen), the Python SDK provides full model attestation including GPU evidence. For 3P Confidential TEE models (deepseek-v3.2 via Chutes), the Python SDK currently provides gateway-only verification; full model attestation for those requires the JavaScript SDK or the standalone `nearai-cloud-verifier` tool. The receipt will record which verification path was used for each juror.

### NEAR tools

| NEAR Tool | Role in Receipts |
|---|---|
| **NEAR AI Cloud (TEE fleet)** | Jurors and red team run as attested open models; response signatures are verified against attestation evidence provided by both NEAR and Intel Trust Authority |
| **Fusion** | Writes the final plain-language reply after jurors vote separately — the synthesis step is explicitly separated from the judgment step |
| **Shade Agents** | Swarm agents run attested code registered in one agent contract; the contract holds the treasury, so no individual holds keys |
| **NEAR Smart Contract** | Verdict registry, receipts, verdict history, challenge stakes, treasury rules — enforced in code, not policy |
| **NEAR Intents** | Paid checks and challenge stakes arrive from any chain; revenue converts to stablecoins |

### The jury diversity constraint — an honest design problem

NEAR AI Cloud's TEE-attested catalog (as of 2026-10-22) is:

| Model | Lab | Tier | Input $/M | Output $/M |
|---|---|---|---|---|
| Qwen 3.8 27B | Alibaba | Private TEE | $0.04 | $1.35 |
| GLM 5.3 Flash | Zhipu AI | Private TEE | $0.08 | $0.50 |
| Qwen3-VL-30B (vision) | Alibaba | Private TEE | $0.15 | $0.55 |
| Qwen 3.6 35B A3B | Alibaba | Private TEE | $0.17 | $1.10 |
| qwen3.5-397b-a17b | Alibaba | Private 3P TEE | $0.50 | $3.30 |
| Kimi K2.6 | Moonshot AI | Private 3P TEE | $0.81 | $3.85 |
| deepseek-v3.2 | DeepSeek | Private 3P TEE | $1.10 | $1.10 |
| Kimi K3 | Moonshot AI | Private 3P TEE | $3.30 | $16.50 |

**All TEE-attested models available today come from Chinese labs** (Alibaba, Zhipu AI, Moonshot AI, DeepSeek). Gemma 4 31B is not in the catalog. Llama and Mistral are not in the catalog, with no in-progress indication on the catalog page. DeepSeek V4 Flash, visible elsewhere in the NEAR AI interface, runs in Incognito mode — outside a TEE — and therefore cannot contribute to an attested verdict.

This is an honest constraint that the proposal addresses rather than obscures:

**The jury composition.** Use three jurors from three distinct Chinese labs — for example, GLM 5.3 Flash (Zhipu), Qwen 3.8 (Alibaba), and deepseek-v3.2 (DeepSeek) — to provide the maximum within-tier diversity available today. They are different model families from different organizations, even though they share a regional origin.

**One Western model as a labeled outside opinion.** A non-attested model such as Claude or Gemini can be run through NEAR AI's Incognito tier and its vote recorded in the receipt — clearly marked "unverified, outside TEE" and not counted toward the verdict. If the outside opinion disagrees with the jury, that disagreement is visible in the receipt and should prompt the red team to look harder. This adds a meaningful cross-check without violating the proof-of-process guarantee, since the attested jury alone decides the on-chain verdict.

**Disclosed in every receipt.** The lab and country of origin of every juror is published in the receipt. On claims touching China-related topics, a higher Contested rate is expected and appropriate — juror disagreement on those topics is the correct safety signal.

**Phase 2 motivation.** This constraint is the primary motivation for Phase 2's custom juror work. A juror trained primarily on primary records rather than the filtered internet would both diversify the jury and potentially outperform general-purpose models on the evidence-grounded tasks Receipts requires.

---

## Scope Policy

Receipts checks verifiable facts on the news people act on: claims someone might vote, invest, share, or decide on.

| Checks | Declines |
|---|---|
| Public officials' votes, statements, sponsored bills, financial disclosures | Private individuals — including tags aimed at exes, coworkers, or enemies |
| Company filings, economic data, on-chain activity, scams | Private finances with no public record |
| Whether an event happened, when, and what was actually said | Bodies, health, sex, and family — even for celebrities |
| Viral statistics and charts without sources | Value judgments (gets both sides' strongest case instead) |

**Why decline at all:** there is no public record to check private matters against. Any answer is speculation. Even an "Unverified" reply spreads the rumor, and the account would become a harassment tool.

**The one exception:** if a person publicly stated something about themselves, Receipts can verify the quote and its context — not the underlying private matter.

**On outrageous public claims:** they are still checked. The reply separates "no evidence found" from "proven false." These are not the same thing.

**On satire:** triage classifies intent before any evidence is gathered. A post flagged as satirical or clearly joking receives a reply that identifies the satirical framing — debunking satire legitimizes it by taking it seriously.

**Public data only.** Every source in every receipt is something anyone can open. No logins, private messages, leaked documents, or data brokers.

**No aggregation.** Triage blocks piecing scattered public details about an individual together, since that is how doxxing works even from public sources.

---

## Economics

### Cost model

Based on confirmed NEAR AI TEE-tier pricing (near.ai/pricing, updated 2026-10-22), using a token budget of ~69,500 input and ~5,000 output tokens per check across all agent roles:

| Jury composition | Cost/check | Notes |
|---|---|---|
| All-GLM 5.3 Flash (cheapest, single-lab) | **~$0.008** | Single lab only — weaker diversity |
| Three-lab: GLM + Qwen 3.8 + deepseek-v3.2 | **~$0.021** | Recommended for routine checks |
| Escalated, 5-juror: GLM×2 + Qwen 3.8×2 + deepseek-v3.2 | **~$0.023** | For split-jury escalation |
| Premium: Kimi K2.6 × 3 | **~$0.039** | High-stakes or high-visibility claims |

Non-jury agents (triage, specialists, red team, auditors, Fusion) use GLM 5.3 Flash ($0.08/M in, $0.50/M out) throughout. The three-lab jury at ~$0.021/check is the recommended default.

**Three cost controls, in order of actual impact:**

1. **Deduplication.** Repeat tags return the stored verdict with zero inference cost. If 30% of incoming tags are duplicates — a conservative assumption for any viral claim — that is an immediate 30% reduction in portfolio cost.
2. **Prefix caching.** Source documents are loaded once and shared across all three jurors, eliminating the most expensive re-processing step.
3. **Cascaded triage.** A small model screens claims before the full jury is invoked. Claims that fail the "is this a checkable factual claim?" gate never reach inference-heavy agents.

### Revenue tiers

At ~$0.021/check (three-lab jury):

| Revenue source | Price/check | Gross margin | Subsidizes N free checks |
|---|---|---|---|
| Paid verification API (agents) | $0.25 | 92% | 11 free/paid |
| Paid verification API (competitive) | $0.50 | 96% | 23 free/paid |
| Prediction market oracle resolution | $2.50 | 99% | 118 free/paid |
| Sponsored claim bounty | $5.00 | 99.6% | 237 free/paid |

### The prediction market oracle opportunity

A May 2026 investigation found that roughly 1 in 5 of Polymarket's disputed-market outcomes involved oracle voters with direct financial stakes in the markets they were adjudicating, and that more than 60% of active UMA voters could be linked to Polymarket trading accounts (reported by Crypto Briefing and Finance Magnates from a Wall Street Journal investigation, May 17, 2026).

Receipts is structurally unable to be that conflict of interest. The contract enforces that the treasury cannot trade on prediction markets — provably. A resolution service with no financial stake in the outcome, a verifiable attested process, and a permanent on-chain record is a credible alternative to the current UMA voter system.

Polymarket's arbitration pipeline runs roughly 230 disputes/month (1,150 disputed markets in the first five months of 2026). See the X API section below for why the full sustainability math is tied to total operating cost rather than inference alone.

### Treasury rules (enforced in contract, not policy)

- Hold only approved stablecoins
- Spend only on inference, APIs, and payouts
- **Never trade on prediction markets** — the contract makes this mechanically impossible, not just prohibited
- Daily proactive sweep budget cap: sweeps slow down when revenue does, before core tag-response functionality is affected
- Treasury floor: if reserves fall below 30 days of base operational cost, proactive sweeps pause entirely and the circuit breaker is visible on the dashboard

The dashboard shows, in real time: fees in, inference out, no prediction-market exposure, and how many free checks each paying check covers.

### X API reply cost — a critical design constraint

X moved to pay-per-use pricing for new developers in February 2026. Current rates: $0.001 per owned mention read, $0.015 per post without a URL, $0.20 per post containing a URL (effective April 2026). The difference is 13×.

At 10,000 free replies per day:
- With a URL in every reply: $2,000/day = **$60,000/month** — economically unviable
- Without a URL: $150/day = **$4,500/month** — manageable alongside ~$6,300/month inference

**The fix is built into the reply design.** Replies carry a short receipt code (e.g. `R-8F2K`) rather than a URL. The receipt explorer lives at a fixed URL in the account bio and pinned post; anyone can look up any receipt by code. This design is also better UX: short replies are more readable and don't get truncated. The full source-link list lives in the receipt, not the reply.

Additionally, dedupe applies to replies: when a claim is tagged again after a verdict exists, the agent quotes or likes the original verdict reply rather than posting a new one. No new post, no new API charge.

Combined monthly operating cost at 10,000 free checks/day: **~$10,800** (inference + X API with no-URL replies). This is the correct sustainability target.

### The prediction market oracle — revised math

- 10,000 free checks/day × $0.021 = $210/day = $6,300/month inference
- Plus X API at $0.015/reply × 10,000 = $150/day = $4,500/month
- **Total: ~$10,800/month**
- At $2.50/resolution: covering this requires ≈ 4,390 paid resolutions/month
- Polymarket dispute pipeline: ~230/month — covers about 5% of this alone
- Path to sustainability: a modest routine-resolution contract (non-disputed markets that still need an auditable record), combined with the agent verification API, at post-hackathon scale

The oracle tier is a post-hackathon business development task. The agent verification API ($0.25–$0.50/check, 92–96% margin) is the more accessible near-term revenue path.

### Hackathon build budget

Estimated two-week build cost:
- ~500 test checks × ~$0.021 (three-lab jury): **$11**
- X API pay-per-use (500 mention reads + 500 replies, no URL): **$8**
- Web search API calls: **$50**
- NEAR testnet / miscellaneous: **$30**
- **Total: ~$100**

The hackathon budget is under $100. X API is no longer the dominant cost — web search is.

---

## Landscape

| Project | What it does | How Receipts differs |
|---|---|---|
| **Grok** | Answers fact-check tags on X | Multi-model jury, published sources, verifiable process; not owned by the platform being fact-checked |
| **X Community Notes AI writers** | AI bots draft notes; human raters decide what shows | Every note carries a verifiable receipt; the process and operator are public; applying as a writer is a stretch goal |
| **Mira Network** | Multi-model consensus on other AI apps' outputs, recorded on-chain | Checks public claims on X; sources primary records; adds red team and challenges |
| **AgentOracle** | Signed verdict receipts for agents before they act | On-chain, public, primary-record evidence, X-native |
| **UMA / Kleros** | Human token-holder dispute voting | AI-speed first verdict; the conflict-of-interest problem documented in Polymarket's dispute system is what Receipts is specifically designed to solve |
| **Bittensor Vericore (Subnet 70)** | Open semantic verification scoring service | Receipts provides on-chain receipts, primary-record evidence, and X-native user flow; Vericore could supply evidence-gathering at scale in Phase 2 |

**Distribution path:** build an on-chain track record through account replies, then apply for Community Notes AI writer registration once that track record exists. The receipt archive compounds over time — every verdict adds to a searchable, citeable corpus.

---

## Risks and Honest Limits

| Risk | Mitigation |
|---|---|
| All TEE-attested models are from Chinese labs; no Western attested models available today | Disclosed in README and every receipt; jury spans three distinct Chinese labs; one non-attested Western model added as labeled outside opinion, not counted toward verdict; receipt shows its vote separately |
| Chinese-origin models may avoid or slant China-related political topics | Contested label fires on juror disagreement; per-juror votes are individually visible in receipt; pattern of avoidance on specific topics is detectable in the public archive |
| Models from different labs still share training biases from the same broad internet | Jury diversity across labs; red team on every verdict; Contested label when jurors split |
| Source selection can carry bias | Source spread across the political spectrum is published in every receipt |
| Breaking news has no primary record yet | "Developing" label; re-checked on a schedule |
| Satire misclassified as sincere claim | Triage step classifies intent before any check; satirical posts get a "appears satirical" reply, not a debunking |
| Prompt injection via the tagged post | Post text is parsed into a strict claim schema; models never decide what gets signed or paid |
| deepseek-v3.2 (3P Chutes TEE) provides only gateway attestation in the Python SDK; full model attestation requires JS SDK or `nearai-cloud-verifier` | Receipt records verification path per juror ("model-attested" vs "gateway-attested"); distinction disclosed to users |
| X API rate limits | Pay-per-use removes hard monthly caps; cost scales with usage; daily sweep budget cap limits exposure |
| Community Notes AI writer API access may not arrive in time | Stretch goal; account replies are the core distribution path |
| Grok's native X integration creates a discoverability gap | Build on-chain track record on high-profile viral claims; the receipt archive becomes a compounding asset |
| Political claims attract coordinated bad-faith challenges | Challenge rules and stake requirements published up front; bad-faith patterns are visible on-chain |
| Free-tier treasury depleted before paid tier scales | Hard treasury floor (30 days operating reserve); circuit breaker pauses proactive sweeps before tag-response is affected |
| Oracle revenue requires active business development, not passive inflow | Oracle tier is explicitly a post-hackathon goal; agent verification API and sponsored bounties are more accessible near-term revenue |

**The pitch promises a fair, auditable process — not certainty.** The README will say so plainly. The Contested label, the source-spread disclosure, and the staked challenge mechanism exist precisely because the system knows its own limits.

---

## Hackathon Scope

### Must ship (two weeks)

- NEAR smart contract: verdict registry, receipts, treasury rules with circuit breaker, one staked challenge
- Triage, dedupe, and primary-record specialists for politics (Congress.gov), economy (BLS), and crypto (on-chain)
- Three-juror jury plus red team and auditors running on attested NEAR AI models
- TEE deployment with attestation signatures in every receipt, verified against Intel Trust Authority
- X mention listener and account replies (pay-per-use, no-URL design — $0.015/reply)
- Receipt explorer page (publicly readable, searchable by receipt code; code included in every reply)

### Stretch

- X Community Notes AI writer registration
- Live proactive sweeps
- Paid verification API through NEAR Intents
- Prediction market resolution tier

### Pre-Nov 1 checklist

- [ ] Read HACKATHON.md on rules for pre-written code
- [ ] Create the X account; load pay-per-use API credits
- [ ] Create NEAR testnet and mainnet accounts
- [ ] Get NEAR AI Cloud key; enumerate current TEE-tier models and confirm attestation signature format with the `/v1/models` endpoint
- [ ] Run the Shade Agent template end to end — this is the riskiest build block and must be de-risked before the window opens
- [ ] Apply to X Community Notes AI writer program (stretch; start early since approval is slow)
- [ ] Get Congress.gov and BLS API keys

### Build schedule (Nov 1–14)

| Days | Block |
|---|---|
| 1–2 | NEAR contract: receipts, treasury, dedupe, challenge |
| 3–4 | Shade Agent wiring; TEE attestation + signature verification |
| 5–6 | Triage agent, claim schema, satire classifier |
| 7–8 | Specialist agents (Congress.gov, BLS, on-chain) |
| 9–10 | Jury, red team, auditors; multi-model voting logic |
| 11–12 | X listener, reply handler, receipt explorer page |
| 13 | README and demo video |
| 14 | Buffer before 23:59 UTC deadline |

### Demo script (~3 minutes)

1. Tag the account under a viral economic statistic. It replies **False** with the BLS source link and a receipt.
2. Look up the receipt code in the explorer: jurors, individual votes (including the labeled outside-opinion Western model), source URLs with content hashes, attestation signatures, Intel Trust Authority certificate for NEAR-fleet models, and gateway-attestation record for the Chutes-hosted DeepSeek juror.
3. Tag a claim about a candidate's vote. It replies **True** with the roll-call link and bill text.
4. Show a **Contested** verdict where jurors split, with both sides' evidence — and explain why Contested is the correct answer here, not a failure.
5. Stake a challenge; watch a fresh jury re-review and uphold the original verdict.
6. Show the treasury dashboard: fees in, inference out, circuit breaker status, and the prediction-market-access lock.

---

## Verdict Shelf Lives and Cache Invalidation

| Claim type | Example | Verdict holds |
|---|---|---|
| Settled past event | A recorded vote, a final score | Indefinitely, unless new evidence appears |
| Live state | A game in progress, a current price | Seconds to minutes; answered by a data lookup, no jury |
| Slow-changing state | Who is CEO, the unemployment rate | Until the next data release or news event |
| Developing story | A breaking incident | Re-checked on a schedule until it settles |

For slow-changing claims, a refresh re-fetches the sources and compares content fingerprints. Unchanged sources keep the stored verdict. Changed sources trigger a new jury run. Every reply carries an as-of timestamp.

**Politician stance records** are handled separately: not a single verdict but a dated stance record — votes, sponsored bills, full quotes in context, and the current platform statement. Words and votes are shown side by side. Hedged positions read "no clear stated position." A new vote or statement triggers a refresh.

---

## Phase 2

### A differently trained juror

Every juror in the v1 system was trained on the same broad internet corpus, concentrated within a single regional origin. Phase 2 explores a juror trained on a different data mix: primary records first — Congressional transcripts, court documents, BLS microdata, SEC filings — rather than the filtered internet.

The realistic path is fine-tuning an open-weight model rather than training from scratch. Start with a narrow specialist — a claim extractor or a primary-record juror for one domain — and run controlled evaluations measuring whether it disagrees with the general-purpose jurors *usefully* (catching errors they miss) rather than just differently (adding noise). Juror independence only improves the jury if disagreement is informative.

### Media verification

Answer "is this real?" for images and video of public events. Provenance first: C2PA content credentials, watermarks, and reverse search for the earliest upload. BitMind (Bittensor Subnet 34) adds a supporting detection signal but never decides alone. AI-written text remains explicitly out of scope: current detectors produce probabilistic outputs that cannot support a fair verdict.

---

## Design Questions

**Does it promise the truth?** No. It promises a provably fair process: which models judged, which sources they read, what instructions they ran under, and proof no human touched the verdict.

**What does "no human intervention" mean?** No person can touch a verdict. Humans still write the rules and prompts — which are published and hashed in every receipt — and anyone can stake a challenge.

**How is it free?** Free for anyone who tags it, paid for at scale. Public checks build an on-chain track record; agents and prediction markets pay for verification they can trust; their fees fund more free checks. The dashboard shows how many free checks each paying check covers in real time.

**Aren't all the jurors from the same region?** Yes — the TEE-attested catalog currently covers only Chinese-origin labs. The jury spans three distinct organizations (Zhipu, Alibaba, DeepSeek) with a labeled non-attested Western model (Claude or Gemini via Incognito tier) added as an outside opinion. This is disclosed in every receipt. The red team and the Contested label are the primary safeguard on the attested verdict. Phase 2 adds a differently trained juror specifically to address this.

**Why not fund it by trading on Polymarket or Kalshi?** Betting on outcomes it judges would create a direct conflict of interest and a front-running risk, and could breach CFTC rules on Kalshi. The smart contract makes the treasury mechanically unable to take prediction-market positions. Markets stay in Receipts as a data source and as paying customers for resolution — never as an investment target.

**Why NEAR and not Bittensor?** Receipts sells proof of process, and NEAR's attested inference provides it today. Bittensor scores outputs and relies on incentive alignment; a subnet is also a months-long build. Bittensor's Vericore (Subnet 70) is a named competitor and a potential Phase 2 evidence-supply partner, with NEAR as the verdict and payment layer.

---

## Sources

- R Street Institute — *AI Writers on Community Notes: An Evaluation of Seven Months of Data* (2026)
- Renault, Mosleh & Rand — *@Grok is this true? LLM-powered fact-checking on social media*, PsyArXiv preprint, Dec 2, 2025
- X / Community Notes team — *Community-Driven API and AI Writer Design for Openly Scaling Community Notes* (2026)
- Wall Street Journal — Polymarket dispute resolution conflict-of-interest investigation (May 17, 2026), as reported by Crypto Briefing and Finance Magnates
- MIT — *The Spread of True and False News Online*, Science (2018)
- IPR / Leger — *2026 Disinformation in Society Report*, 6th Annual
- NEAR AI — *Building Next-Gen NEAR AI Infrastructure with TEEs* (2026)
- NEAR AI — *NEAR AI Cloud Integrates Intel Trust Authority* (2026)
- NEAR AI — Model catalog and pricing, near.ai/pricing (last updated 2026-10-22)
- Coinpedia Research — *Prediction Markets Could Reach $1 Trillion by 2030* (2026)
- Cornell / CEPR — *When Trust in Official Statistics Declines* (2026)
- Chris Fregly, *AI Systems Performance Engineering* (O'Reilly, 2025) — chapters 15–16 on prefix caching, model cascading, request coalescing
- NEAR AI docs: Models and privacy tiers · Fusion · Web search · Verification · Shade Agents terminology
- Indicator.media — *8 AI Bots Now Write 50% of X's Community Notes* (2026)
- CJR — *X Is Using AI Fact-Checkers* (2026)