# Receiptz system architecture

**Status:** draft for discussion. Nothing here is built yet. It covers how the system runs, who builds what, and the interfaces between the two halves. Behavior and requirements live in [README.md](README.md). This document only adds the decisions the README leaves open.

Sections are marked:
- **Decided:** agreed, build against it
- **Proposed:** a starting point, push back if it doesn't work for your side
- **Open:** needs a decision from both of us

---

## 1. Overview

```
                        ┌──────────────── one always-on server ────────────────┐
 X tag ──webhook──▶     │ 1. X listener    returns 200 immediately             │
                        │       │                                              │
                        │ 2. Triage        extract, decline, dedupe ───────────┼──▶ register_claim
                        │       │                                              │
                        │ 3. Evidence      fetch, hash, archive ───────────────┼──▶ attach_sources
                        │       │                    └──▶ IPFS / private store │
                        │ 4. Jury          jurors → red team → auditors ◀──────┼─── NEAR AI Cloud
                        │       │                                              │
                        │ 5. Receipt       build JSON, pin to IPFS ────────────┼──▶ submit_verdict
                        │       │                                              │
                        │ 6. X replier     POST /2/tweets to tag post ID       │
                        └──────────────────────────────────────────────────────┘
                                                                     │
                                       7. NEAR contract (receiptz) ◀─┘
                                                │
                                       8. Lookup site  /r/<code>  (reads contract + IPFS)
```

Supporting pieces that aren't in the request path:
- **9. Accounts and deploy:** creates the agent sub-accounts and scoped function-call keys
- **10. Dev tools and test set:** `npm run check` runs steps 2–6 without X; 50 labeled test claims

---

## 2. Hosting and trigger (Decided)

| Part | Where it runs |
|---|---|
| X listener, agents (steps 1–6) | One small, always-on server |
| NEAR contract | NEAR testnet (then mainnet) |
| Receipts, government records | IPFS via a pinning service |
| News article copies | Private storage, not public (per README) |
| Lookup site | Static or server-rendered web host |

**Flow of one check:**
1. A tag arrives as an **X Activity API webhook**.
2. The server responds `200` right away and keeps the tag's post ID.
3. The server runs steps 2–6 in order, in the same process.
4. The reply is a separate `POST /2/tweets` to the tag's post ID, sent when the check finishes.

**Why a server, not serverless:** a check makes several model calls and on-chain transactions, so it likely takes minutes. Most serverless platforms stop the function soon after it sends its response, so a check could be cut off partway through, after `register_claim` and before `submit_verdict`. That would leave a false "abandoned" run on-chain. A server keeps running after the `200`.

**Host requirements:**
- Must not sleep when idle. A sleeping host can miss X's webhook timeout.
- Must expose a public HTTPS endpoint for the webhook.
- Secrets (API keys, agent account keys) live in host environment variables and are never committed.

**To verify:**
- X pay-per-use allows 1 webhook and 3 subscriptions. Confirm the subscribable events include posts that *mention* `@checkreceiptz`, not only posts *by* it.
- X's webhook timeout and retry behavior.

---

## 3. Ownership (Decided)

The split follows dependencies: components that pass data back and forth sit with one person, so we each build in parallel and only agree on the handoffs between halves.

| # | Component | Owner |
|---|---|---|
| 7 | NEAR contract (Rust) | 0xtitan6 |
| 9 | Accounts and deploy | 0xtitan6 |
| 8 | Lookup site | 0xtitan6 |
| 3 | Evidence specialists (one per domain, Economy first) | 0xtitan6 |
| 1, 6 | X listener and replier | Benny |
| 2 | Triage | Benny |
| 4 | Jury, red team, auditors | Benny |
| 5 | Receipt builder | Benny |
| 10 | Dev tools and test set | **Open** |

The handoffs between the two halves are:
1. the contract interface (§4)
2. triage → evidence (§5)
3. evidence → jury (§6)
4. the receipt JSON format, which the receipt builder writes and the lookup site reads (§7)

---

## 4. Contract interface (Proposed, taken from README)

Method names and arguments come from the README. Return values and errors still need to be agreed. Until the contract is deployed, the agents can build against a stub that returns these shapes.

| Method | Caller | Arguments | Returns / errors |
|---|---|---|---|
| `register_claim` | `triage.receiptz` | `post_id, claim_hash, run_id, jury_config` | **Open** |
| `attach_sources` | `evidence.receiptz` | `run_id, source_hashes, archive_cids` | **Open** |
| `submit_verdict` | `jury.receiptz` | `run_id, verdict, receipt_cid` | Rejects a second verdict for the same `run_id` |
| `get_runs_by_post` (view) | anyone | `post_id` | All runs for the post, each with status: verdict / pending / abandoned |
| by claim hash (view) | anyone | `claim_hash` | **Open:** name and shape |

---

## 5. Triage → evidence (Proposed)

```
run_id           from register_claim
domain           e.g. "economy"; selects the specialist
claim_text       normalized claim
post_created_at  timestamp of the post containing the claim
subject          e.g. "unemployment rate"
place            e.g. "US"
period           e.g. "2026-09"; triage resolves relative dates like "last month"
claimed_value    e.g. "10%"
```

`post_created_at` is required because relative dates ("last month") depend on when the post was written, not when it was checked.

---

## 6. Evidence → jury (Proposed)

Each source:

```
url            where it was fetched from
content_hash   hash of the copy Receiptz fetched
fetched_at     fetch time
archive_ref    IPFS CID (government records) or private archive reference (news)
tier           primary | news | social
excerpt        the lines relevant to the claim
```

If no primary record exists, evidence returns `primary_record: not_found` instead of an empty list, and the jury returns **Unverified** (README verdict rule).

**Jurors get excerpts, not full pages.** It's cheaper across 3–4 jurors, keeps the relevant lines in front of them, and puts less untrusted text in their prompts. The full page is still fetched, hashed, and archived. To catch a misleading excerpt, **the auditors also check that each excerpt appears in its archived full copy and is not taken out of context.** A failed check blocks the verdict, the same as an unsupported citation.

---

## 7. Open questions

1. **Duplicate tags.** How do we stop one tag from starting two checks, for example if X delivers the event twice? This has to happen before `register_claim`.
2. **Which post ID does the contract index?** The tag is usually a reply. The claim is in the parent post. If two people tag the same viral post, should their runs share one history?
3. **`receipt_cid` ordering.** `submit_verdict` needs the receipt's IPFS CID, so the receipt has to be built and pinned before the verdict is submitted. Does the jury build the receipt, or does the receipt builder run first and return the CID?
4. **Receipt JSON format.** The fields are listed in the README under "What a receipt records". Exact names and structure are needed by both the receipt builder and the lookup site.
5. **Contract return values and errors** (§4).
6. **Who owns dev tools and the 50-claim test set?**
7. **Which host** for the server, and which IPFS pinning service.
