# Receiptz

Receiptz is a fact-checking agent on X. A user replies to a post with `@checkreceiptz is this true?`. The agent checks the claim against primary records, has AI models from different labs judge it independently, and replies with a verdict, its sources, and a receipt code. Each receipt is a public record of how the verdict was reached: the claim as registered, every run registered for it, the sources read, the models that judged, their individual votes, and attestation evidence for each model run.

Built for NEAR HACKATHON (Nov 1–14, 2026).
Tracks: `swarms`, `security`, `open`.

> **Status:** live on NEAR testnet. The bot answers tags on X, every check is registered and judged on-chain, and every receipt can be verified on the lookup site. Sections marked *(planned)* describe behavior that is not built yet; [Built today](#built-today) lists exactly what runs now.

## Live demo

| | |
|---|---|
| Bot | [@checkreceiptz](https://x.com/checkreceiptz): reply to a post with `@checkreceiptz is this true?` |
| Lookup site | http://52.17.217.82:3000: search a receipt code or run ID |
| Contract | [`receiptz-0xtitan6.testnet`](https://testnet.nearblocks.io/address/receiptz-0xtitan6.testnet) |
| Agent accounts | `triage.receiptz-0xtitan6.testnet`, `jury.receiptz-0xtitan6.testnet` |
| First live reply | https://x.com/0xtitan6/status/2121696770199519317 |

On a receipt page, Receiptz re-hashes the saved receipt and compares it with the CID stored on-chain. A match shows **VERIFIED ON NEAR**; any edit to the receipt shows **TAMPERED**.

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

## Built today

What runs at the end of the hackathon (Nov 14, 2026). Everything else in this README is the design.

| Step | Built | Notes |
|---|---|---|
| Tag on X | Yes | `src/bot.ts` polls mentions every 60 s, checks the parent post, records each mention ID before checking so a crash can't cause a second run, replies with verdict + lookup link |
| Triage | Yes | One claim per post; domains: economy, politics, crypto, companies, markets, other |
| Dedupe of repeat claims | No | Day 2 |
| Commit (`register_claim`) | Yes | Signed by the triage account before any evidence is read |
| Evidence | Yes | An LLM router picks one query from an allowlisted catalog of primary records; reference and web sources run alongside (see below) |
| `attach_sources` | No | Day 2. Source hashes are in the receipt, not yet on-chain before the votes |
| Jury | Yes | GLM 5.3 Flash (Zhipu), Qwen 3.8 27B (Alibaba), DeepSeek v4.1 Flash (DeepSeek); red team; deterministic auditor that rejects any citation not in the evidence set |
| `submit_verdict` | Yes | Signed by the jury account; late verdicts (after the 15-minute timeout) are stored as `Late` |
| Abandoned runs | Yes | Computed by the contract at read time; shown on the lookup site |
| Receipt storage | Partly | Receipt JSON is saved by Receiptz and served by the lookup site; its CIDv1 (sha-256) is on-chain. IPFS pinning is day 2 |
| Lookup site | Yes | `src/server.ts`: live on-chain status, CID check, jurors, evidence |
| Juror attestation checks | No | Raw API responses are stored in the receipt; signature verification is planned |

**Evidence sources in use**

| Domain | Primary record (tier 1) | Also used |
|---|---|---|
| Economy | BLS, BEA, Census | Web search (Tavily) only if no primary record fits |
| Politics | Congress.gov (party control) | Wikipedia, web search |
| Crypto | NEAR and Ethereum RPC (balances), DefiLlama (TVL) | CoinGecko live prices (tier 2), Wikipedia, web search |
| Companies | SEC EDGAR company facts | Web search only if no primary record fits |
| Markets | Stock quotes | Web search only if no primary record fits |
| Other | none | Wikipedia, web search |

In the code, tier 2 is market-data aggregators and tier 3 is reference and web pages (Wikipedia, Tavily). Jurors see each source's tier and are told to lower confidence when only tier 3 supports a verdict. Because every domain has at least reference sources, the "can't check this yet" reply no longer fires; weak evidence produces Unverified instead.

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

## Try it

### Prerequisites

- Node.js 20+
- NEAR AI Cloud API key
- For the bot: X API credentials (pay-per-use) for the bot account
- To deploy your own contract: Rust 1.95+ with the `wasm32-unknown-unknown` target, `cargo-near`, `near` CLI, a NEAR testnet account

### Environment (`.env`, never committed)

| Variable | Needed for |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `TRIAGE_MODEL`, `RED_TEAM_MODEL`, `JURORS` | Triage, jury, red team (NEAR AI Cloud) |
| `NEAR_RPC_URL`, `NEAR_CONTRACT_ID`, `NEAR_TRIAGE_ID`, `NEAR_TRIAGE_KEY`, `NEAR_JURY_ID`, `NEAR_JURY_KEY` | On-chain runs. Without the two keys, checks run locally and nothing is registered |
| `BLS_API_KEY`, `BEA_API_KEY`, `CENSUS_API_KEY`, `CONGRESS_API_KEY`, `SEC_USER_AGENT` | Primary records |
| `TAVILY_API_KEY` | Web search |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `LOOKUP_URL` | The bot. Get the bot account's token with `npx tsx scripts/x-auth.ts` |

### Run

```bash
git clone https://github.com/0xtitan6/Recieptz
cd Recieptz
npm install
npm run check -- "The U.S. unemployment rate is above 10%."   # one check, end to end
npm run serve                                                 # lookup site at http://localhost:3000
npm run bot                                                   # X bot (polls mentions)
```

### Contract

```bash
cd contract
cargo +1.95 test                                              # 8 unit tests
cargo +1.95 near build non-reproducible-wasm
near contract deploy <your-account>.testnet use-file target/near/receiptz_contract.wasm \
  with-init-call new json-args '{"triage":"triage.<your-account>.testnet","jury":"jury.<your-account>.testnet","timeout_ms":900000}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-read-only <your-account>.testnet get_run json-args '{"run_id":"<run id>"}' network-config testnet now
```

### Do X, see Y

Rows marked *(planned)* describe the full design and do not work yet.

| Do | See |
|---|---|
| `npm run check -- "The unemployment rate was 10% last month"` | A False verdict citing the latest BLS release, and a receipt code |
| Open `http://localhost:3000/run/<code or run id>` | The claim, live on-chain status, a VERIFIED stamp if the receipt matches the on-chain CID, sources with tiers, each juror's vote and reasoning |
| `npm run check -- "Republicans control the US Senate."` | A verdict citing Congress.gov party counts |
| `npm run check -- "<senator> voted for <bill>"` *(planned)* | A True or False verdict naming the roll-call vote and bill |
| `npm run check -- "<wallet> sold 2M <token> before the announcement"` *(planned)* | A verdict citing the on-chain transactions and block timestamps |
| `npm run check -- "Apple's revenue was over 300 billion dollars last fiscal year."` | A verdict citing SEC EDGAR company facts |
| `npm run check -- "The Eiffel Tower is in Berlin."` | False, from reference and web sources, at lower confidence than a primary-record verdict |
| `npm run check -- "Is this policy good?"` | A decline ("not a checkable public claim"). Both sides' strongest case is *(planned)* |
| `npm run check -- "Did <celebrity> get surgery?"` | A decline that does not repeat the claim |
| Run the same check twice *(planned)* | The second call returns the stored verdict and receipt code; no new run ID |
| Register a run and never submit a verdict | After the 15-minute timeout, `get_run` and the lookup site show it as Abandoned. The run count on the receipt is *(planned)* |
| `near contract call-function as-read-only receiptz-0xtitan6.testnet get_runs_by_post json-args '{"claim_post_id":"<id>"}' network-config testnet now` | Every run for that post, including reworded claims, with each run's status |
| Call `submit_verdict` from `triage.receiptz-0xtitan6.testnet` | The contract rejects it: "only jury can submit verdicts". Scoped function-call keys are day 2 |
| Tag `@checkreceiptz is this true?` on a live post | Within 1–3 minutes, a reply with label, confidence, source name and a lookup link |

---

## Costs

| Item | Cost |
|---|---|
| Inference per check (jury and all agents) | ~$0.021 estimated for an earlier all-TEE jury; to be re-measured for the mixed jury |
| Web search per check | To be measured; primary records use free government APIs, and paid search is capped per check and used for news context only |
| X reply (no URL) | $0.015 |
| Repeat tag of an already-checked claim | No inference; reply cost only |

Replies are meant to carry a receipt code instead of a link, because X charges $0.20 for posts containing a URL versus $0.015 without ([summary of X's pay-per-use pricing](https://www.upload-post.com/x-api-pricing/); official rates at docs.x.com). The lookup site is linked from the account bio. **During the hackathon the bot's replies include a lookup link**, so each reply costs the URL rate; switching to codes is day 2.

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

## Day 2 (next)

- Pin receipts and fetched government records to IPFS (the CID on-chain already matches the receipt bytes)
- `attach_sources`: commit source hashes on-chain before the jury votes
- Scoped function-call keys for the triage and jury accounts (today they hold full-access keys)
- Dedupe repeat claims and show "N runs registered, M without a verdict" on each receipt
- Verify NEAR AI signatures and attestation for each juror and show the result on the receipt
- Fourth-lab escalation juror and the Contested threshold tuned on the 50-claim test set
- Stable host: Elastic IP, a domain and HTTPS for the lookup site
- Replies with a receipt code instead of a URL, to cut X's per-reply cost (see [Costs](#costs))
- GDELT news specialist (written, not enabled: the API rate-limited and returned empty results in testing)

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