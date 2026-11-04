# Receiptz

Receiptz is a fact-checking agent on X. A user replies to a post with `@checkreceiptz is this true?`. The agent checks the claim against primary records, has AI models from different labs judge it independently, and replies with a verdict, its sources, and a receipt code. Each receipt is a public record of how the verdict was reached: the claim as registered, every run registered for it, the sources read, the models that judged, their individual votes, and attestation evidence for each model run.

Built for NEAR HACKATHON (Nov 1–14, 2026).
Tracks: `swarms`, `security`, `open`.

> **Status:** in development. Sections marked *(planned)* describe behavior that is not built yet.

---

## Problem

AI models already fact-check posts on X at scale. AI-written Community Notes had 88.8% of their decided notes upheld, versus 68.5% for human writers, over seven months of public data ([R Street, 2026](https://www.rstreet.org/research/ai-writers-on-community-notes-an-evaluation-of-seven-months-of-data/)). By May 2026, eight AI contributors wrote 50.3% of visible Community Notes ([Indicator](https://indicator.media/p/8-ai-bots-now-write-50-of-x-s-community-notes)).

None of these systems shows how it reached a verdict. Grok is a single model owned by the platform it checks. AI note writers are run by unidentified operators with unpublished processes. A reader cannot tell which sources were used, what instructions the model followed, or whether the operator re-ran the check until it produced a preferred answer.

Receiptz does not claim to output the truth. It makes the process inspectable: the claim is committed before judging, every run is recorded, runs that never produced a published verdict are counted and shown, and each juror's output is tied to attestation evidence.

---

## How it works

1. **Tag.** A user replies to a post with `@checkreceiptz is this true?`
2. **Triage.** A small model extracts specific, checkable claims and normalizes their text. Opinions, satire, gossip and private matters are declined (see [Scope](#scope)).
3. **Dedupe.** If a normalized claim exactly matches an already-checked claim whose verdict is still fresh, the stored verdict is returned. Loose matches are shown as "matched to R-8F2K: '<original claim>'" so the user sees what was actually checked, or the claim is checked fresh.
4. **Commit.** Before any juror runs, the triage agent registers the post ID, the claim hash, a run ID and the jury configuration in the NEAR contract.
5. **Gather evidence.** A specialist agent fetches primary records for the claim's domain, then news context. Each source is hashed and archived (see [What a receipt records](#what-a-receipt-records)).
6. **Judge.** Three jurors from three AI labs vote independently. A red team searches for counter-evidence. Auditors check that each citation supports the claim it is cited for.
7. **Record and reply.** The jury agent submits the verdict for that run ID. The contract accepts exactly one verdict per run ID. A run with no verdict after a timeout is marked abandoned. The agent replies with a label, confidence, source names and a receipt code.
8. **Update.** Re-checks happen through recorded refreshes (new evidence) or appeals *(planned)*. Every run, including superseded and abandoned ones, stays visible.

**Labels:** True · False · Misleading · Unverified · Contested

### Verdict rules

- Three jurors from three different labs vote.
- True, False or Misleading publishes when all three agree and the red team has not produced counter-evidence that auditors confirm. Argument alone does not block a verdict.
- If jurors split, escalate by adding a juror from a fourth lab. Three of four labs in agreement publishes at lower confidence; otherwise the verdict is Contested.
- Insufficient primary evidence produces Unverified, regardless of juror lean.
- Auditors block any verdict that cites a source not supporting the claim.

The share of Contested verdicts is measured on a labeled test set of 50 claims before launch; thresholds are tuned against it.

### Evidence tiers

| Tier | Role | Examples |
|---|---|---|
| 1. Primary records | Decide factual claims | BLS releases, voting records, bill text, transcripts |
| 2. News across the spectrum | Context; disagreement between outlets is reported | Left, center and right outlets, with the spread recorded |
| 3. Social posts | Leads and original footage only, never evidence | Viral posts, original uploads |

### Domains

Each domain is one specialist agent that knows where that domain's primary records live. Triage, jury, red team, auditors and receipts are shared. Specialists are built in this order:

| # | Domain | Primary records | Example claim |
|---|---|---|---|
| 1 | Economy | BLS, BEA, FRED, Census APIs | "Unemployment hit 10% last month" |
| 2 | Politics | Congress.gov, GovInfo, OpenFEC (campaign finance) | "Senator X voted for bill Y" |
| 3 | Crypto | NEAR and Ethereum RPC, block explorers, DefiLlama | "This wallet dumped 2M tokens before the announcement" |
| 4 | Companies and markets | SEC EDGAR filings | "Company X reported a loss last quarter" |
| 5 | Courts | CourtListener / RECAP dockets and opinions | "Judge X blocked the order" |
| 6 | Quotes and events | Official transcripts, C-SPAN, government press releases, original video | "The president said X at the rally" |
| 7 | Public health statistics | CDC data, openFDA, WHO | "Measles cases tripled this year" |
| 8 | Science | PubMed, Crossref, retraction records | "A new study proves X causes Y" |
| 9 | Weather and disasters | NOAA / NWS, USGS | "This was the strongest hurricane on record" |
| 10 | Sports | Official league box scores and records | "Player X broke the all-time scoring record" |

**Outside coverage.** If a claim falls in a domain whose specialist is not built yet, or in no domain, the agent replies: "I can't check this against primary records yet. Covered today: <domains>." It does not guess, and no verdict or run is recorded.

Public health statistics cover population-level data only. Claims about an individual's health stay declined (see [Scope](#scope)).

---

## Architecture

```
X mention
   │
   ▼
triage.receiptz.near ── extract and normalize claims
   │                    decline: opinion / satire / private / gossip
   │                    dedupe: exact match → stored verdict
   │  register_claim(post_id, claim_hash, run_id, jury_config)
   ▼
evidence.receiptz.near ── fetch, hash and archive sources
   │  attach_sources(run_id, source_hashes, archive_cids)
   ▼
jury.receiptz.near ── 3 jurors (3 labs) → red team → auditors
   │  submit_verdict(run_id, verdict, receipt_cid)
   ▼
receiptz.near (contract) ── one verdict per run ID; run history by post ID and claim hash
   │
   ▼
X reply: label + confidence + source names + receipt code
```

### Run integrity

- Runs are indexed by **post ID** and by **claim hash**. Rewording a claim produces a new claim hash but not a new post ID, so a reworded re-check still appears in the post's run history.
- Every run has a status: **verdict**, **pending**, or **abandoned** (no verdict before the timeout).
- The operator sees the jury's output before `submit_verdict` is called, so it could withhold an unwanted verdict and register a new run. The one-verdict-per-run rule does not prevent this. What exposes it is the abandoned run: every receipt shows "N runs registered for this post, M without a verdict," and the lookup site flags any post with abandoned runs.

### Agent accounts and permissions

Each agent runs under its own NEAR sub-account with a function call key scoped to the contract methods it needs:

| Account | Allowed methods | Cannot |
|---|---|---|
| `triage.receiptz.near` | `register_claim` | Submit verdicts, move funds |
| `evidence.receiptz.near` | `attach_sources` | Submit verdicts, move funds |
| `jury.receiptz.near` | `submit_verdict` | Register claims, move funds |
| `receiptz.near` | Owner: contract upgrades, funding | Submit verdicts directly |

This split limits damage from bugs and prompt injection: a compromised triage agent cannot submit a verdict. It does not limit the operator, who holds all of these keys. Protection against the operator comes from the public run history and, once Shade Agents are integrated, from only TEE-attested agent code being able to call the contract.

---

## NEAR technology used

| Technology | Use |
|---|---|
| NEAR AI Cloud | Jurors, red team and auditors run through NEAR AI Cloud; every response carries a signature (model TEE or attested gateway) that is checked against attestation evidence |
| Shade Agents *(planned)* | Agent code runs in a TEE and is registered with the agent contract, so only approved code can call it. Fallback if integration is not complete: agents run outside a TEE, and NEAR AI attestations and signatures are still recorded per juror run |
| Smart contract | Claim registry, run IDs and statuses, one-verdict-per-run rule, run history by post ID and claim hash |
| Sub-accounts | One account per agent role |
| Function call keys | Each agent can call only its own contract methods |
| Fusion | Writes the plain-language reply after jurors have voted separately |
| NEAR Intents *(planned)* | Paid verification API and appeal deposits from any chain |

### The jury

NEAR AI Cloud returns a signature for each response (`/v1/signature/<id>`) at one of two levels:

| Level | Signature kind | What it proves | Models |
|---|---|---|---|
| **Model-attested** | `provider_tee` | The response came from the named model running in a TEE; the signed text is `<model_id>:<request_hash>:<response_hash>` | Open models on NEAR's TEE fleet or attested third-party TEEs |
| **Gateway-attested** | `gateway` | NEAR AI's TEE gateway sent and received these exact bytes; the operator cannot fabricate or edit the output. It does not prove what ran at the model provider | External models (Anthropic, OpenAI, Google, xAI) |

As of Oct 23, 2026, every model-attested text model on NEAR AI Cloud comes from a Chinese lab ([catalog](https://near.ai/models)). Western models are available only as gateway-attested. The jury mixes both:

| Juror | Lab | Level | Role |
|---|---|---|---|
| GLM 5.3 Flash | Zhipu AI | Model-attested (NEAR TEE) | Default |
| Qwen 3.8 27B | Alibaba | Model-attested (NEAR TEE) | Default |
| Claude Haiku 5.5 | Anthropic | Gateway-attested | Default |
| GPT-6 Luna | OpenAI | Gateway-attested | Escalation |

Each receipt records the signature kind, signer address and verification result for every juror.

**Tested Oct 23, 2026.** Claude Haiku 5.5 and GPT-5 Nano responses returned `gateway` signatures from the attested gateway key; the signer recovered correctly and the signed hashes matched the exact request and response bytes. GLM 5.3 Flash returned `provider_tee` only for non-streamed requests; streamed requests received only a `gateway` signature. **Juror calls are therefore always made with `stream: false`.** Not yet verified: the TDX attestation quotes that bind the gateway and model signing keys to hardware. Receipts mark a juror "verified" only after that check passes.

**Fallbacks.** If a gateway-attested juror is unavailable, Kimi K2.6 (Moonshot AI, model-attested in a third-party TEE) takes its place. deepseek-v3.2 was listed but not ready on Oct 23, 2026, and is not part of the default jury.

---

## What a receipt records

- Receipt code, run ID, post ID, claim hash
- Jury configuration committed before judging
- Run history for the post: runs registered, runs with a verdict, runs abandoned
- For each source: URL, hash of the copy Receiptz fetched, fetch time, and archive reference
- For each juror: model ID, lab, signature kind (model-attested or gateway-attested), signer address, response signature, verification result, vote
- Prompt version hash
- Verdict, confidence, timestamp

### Where data lives

| Data | Location |
|---|---|
| Run registry, statuses, claim hashes, verdict, receipt content ID | NEAR contract (on-chain) |
| Full receipt JSON | Content-addressed storage (IPFS, pinned by Receiptz); its content ID is stored on-chain, so any change to the receipt is detectable |
| Government records (public domain) | Full fetched copy in content-addressed storage; hash on-chain |
| News articles | Fetched copy retained privately by Receiptz for disputes and hashed; the receipt publishes the hash, a short quoted excerpt, and an archive.org link |

The archive.org snapshot is taken separately from Receiptz's fetch, so its content may differ from the hashed copy. The receipt labels it as an independent reference, not as the hashed source.

**Limits of verification.** LLM outputs are not exactly reproducible, so a receipt allows checking the inputs, signatures and attestations, not a byte-for-byte replay. For gateway-attested jurors, the signature proves the operator did not alter the output, not what the model provider ran. Source fetching runs outside a TEE until the Shade Agent integration is complete; until then, hashes and archived copies are the check on source integrity.

---

## Scope

| Checks | Declines |
|---|---|
| Public officials' votes, statements, bills, financial disclosures | Private individuals |
| Economic data and official statistics | Private finances with no public record |
| Whether an event happened and what was said | Bodies, health, sex and family, including celebrities |
| Viral statistics without sources | Value judgments (returns the strongest case from each side, no verdict) |
| On-chain activity, company filings, court records | Wallet-to-person identification not already public |
| Public health, science, weather and sports records | Forward-looking predictions (no record exists yet) |

- Public sources only: no logins, private messages, leaked documents or data brokers.
- Triage blocks combining public details about an individual.
- Decline replies do not repeat the claim.
- The agent replies only when tagged. It never replies to posts it was not mentioned in.

---

## Try it *(planned)*

### Prerequisites

- Node.js 20+, Rust with `cargo-near`, NEAR CLI, a NEAR testnet account
- NEAR AI Cloud API key
- X API credentials (pay-per-use)
- API keys for the domains you enable: BLS, BEA, FRED, Census, Congress.gov, GovInfo, OpenFEC, CourtListener, a block explorer (e.g. Etherscan). SEC EDGAR, NEAR RPC, DefiLlama, CDC, openFDA, PubMed, Crossref, NOAA and USGS need no key

### Setup

```bash
git clone https://github.com/0xtitan6/receiptz
cd receiptz
cp .env.example .env      # add API keys; never commit this file
npm install
npm run contract:deploy   # deploys receiptz contract and agent sub-accounts to testnet
npm run agents:dev        # runs triage, evidence and jury agents locally
npm run explorer:dev      # receipt lookup at http://localhost:3000
```

### Do X, see Y

| Do | See |
|---|---|
| `npm run check -- "The unemployment rate was 10% last month"` | A False verdict citing the latest BLS release, and a receipt code |
| Open `http://localhost:3000/r/<code>` | The committed claim, run history, sources with hashes and archive references, each juror's vote, model ID, lab and verification path |
| `npm run check -- "<senator> voted for <bill>"` | A True or False verdict naming the roll-call vote and bill |
| `npm run check -- "<wallet> sold 2M <token> before the announcement"` | A verdict citing the on-chain transactions and block timestamps |
| `npm run check -- "<company> reported a loss last quarter"` | A verdict citing the 10-Q filing on SEC EDGAR |
| `npm run check -- "<claim in a domain not yet built>"` | "I can't check this against primary records yet," with the list of covered domains; no run is recorded |
| `npm run check -- "Is this policy good?"` | A "not a factual claim" reply with both sides' strongest case and no verdict |
| `npm run check -- "Did <celebrity> get surgery?"` | A decline that does not repeat the claim |
| Run the same check twice | The second call returns the stored verdict and receipt code; no new run ID |
| `npm run abandon-demo -- <post_id>` (registers a run and never submits a verdict) | After the timeout, the run shows as abandoned and the receipt reads "2 runs registered, 1 without a verdict" |
| `near view receiptz.testnet get_runs_by_post '{"post_id":"<id>"}'` | Every run for that post, including reworded claims, with each run's status |
| Call `submit_verdict` from `triage.receiptz.testnet` | The contract rejects it: the key is not allowed to call that method |
| Tag `@checkreceiptz is this true?` on a live post | A reply with label, confidence, source names and receipt code |

---

## Costs

| Item | Cost |
|---|---|
| Inference per check (jury and all agents) | ~$0.021 estimated for an earlier all-TEE jury; to be re-measured for the mixed jury |
| Web search per check | To be measured; primary records use free government APIs, and paid search is capped per check and used for news context only |
| X reply (no URL) | $0.015 |
| Repeat tag of an already-checked claim | No inference; reply cost only |

Replies carry a receipt code instead of a link, because X charges $0.20 for posts containing a URL versus $0.015 without ([summary of X's pay-per-use pricing](https://www.upload-post.com/x-api-pricing/); official rates at docs.x.com). The lookup site is linked from the account bio.

Model prices: [NEAR AI catalog](https://near.ai/models), Oct 22, 2026.

---

## Known limits

- **Two levels of attestation.** Model-level attestation is available only for Chinese-lab models; Western jurors are gateway-attested, which proves the operator did not alter their output but not what ran at the provider. Each juror's level is shown in every receipt.
- **Shared training data.** Models from different labs still learned from overlapping data.
- **Source selection bias.** The spread of news sources is recorded in every receipt.
- **Breaking news.** No primary record exists yet; claims are marked developing and re-checked.
- **Prompt injection.** Posts are parsed into a strict claim schema; models never choose contract calls or payments.
- **Run integrity before Shade Agents.** Without TEE-hosted agent code, the operator controls when claims are registered and sees verdicts before submitting them. Withheld verdicts appear as abandoned runs, but the operator is not prevented from abandoning them.
- **Operator holds all agent keys.** The per-agent key split protects against bugs and injected instructions, not against the operator.
- **Contract upgrades.** During the hackathon, the owner account can upgrade the contract, which could change how history is stored or read. Receipt content IDs and source hashes already published remain checkable against copies held elsewhere. After the hackathon, upgrades will be either locked or placed behind a public time delay announced on-chain *(planned)*.

---

## Planned after the hackathon

- Shade Agent integration, so only TEE-attested agent code can register claims and submit verdicts
- Contract upgrades locked or behind a public time delay
- Appeals with a refundable deposit through NEAR Intents, re-reviewed by a fresh jury
- Paid verification API for AI agents
- Publishing proactive checks of viral claims to the account's own timeline and the lookup site (no unsolicited replies)
- X Community Notes AI writer registration
- Funding contract restricted to an allowlist of addresses (inference, API and payout recipients), with no ability to send funds to prediction-market contracts
- A Western open model (e.g. Llama or Gemma) self-hosted in an attested TEE, so model-level attestation spans both regions
- A juror fine-tuned on primary records
- Image and video provenance checks

---

## Related work

| Project | Difference |
|---|---|
| Grok | Multiple models from different labs, recorded sources and votes, not owned by the platform it checks |
| X Community Notes AI writers | Public process and operator; receipt per verdict |
| Mira Network | Checks public claims on X against primary records |
| AgentOracle | Public on-chain receipts; primary-record evidence |
| Vericore (Bittensor Subnet 70) | X-native flow with public receipts |

---

## License

TBD