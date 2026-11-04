# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Receiptz is a fact-checking agent on X with on-chain receipts, built for the NEAR hackathon (Nov 1–14, 2026) by two people: **0xtitan6** and **Benny**. As of Oct 24, 2026 the repo holds design documents only. There is no code, build setup or tests yet.

## Read first

1. [README.md](README.md): what Receiptz does, verdict rules, scope, the jury, what a receipt records. This is the source of truth for behavior.
2. [ARCHITECTURE.md](ARCHITECTURE.md): hosting, who owns which component, the interfaces between the two halves, and open questions. Sections are marked **Decided**, **Proposed** or **Open**.
3. The latest file in each folder under [logs/](logs/): what each person did last, what's next, and what they need from the other.

[PROPOSAL.md](PROPOSAL.md) is superseded by README.md. Don't use it as a spec.

## Ownership

| Owner | Components |
|---|---|
| 0xtitan6 | NEAR contract, accounts and deploy, lookup site, evidence specialists |
| Benny | X listener and replier, triage, jury (red team, auditors), receipt builder |

Ask which person you're working with if it isn't clear. Work in that person's components. If a task needs a change in the other person's components, describe the change for them instead of making it.

## Interfaces

The handoffs between the two halves are defined in ARCHITECTURE.md §4–7: the contract methods, triage → evidence, evidence → jury, and the receipt JSON format.

- Build against these interfaces as written. Until the other side exists, use a stub that returns the documented shapes.
- Don't change an interface on your own. Propose the change, update ARCHITECTURE.md only once both people agree, and record it under **Interface changes** in that day's log.
- If an **Open** question blocks the task, say so and ask; don't silently pick an answer.

## Logs

Each person writes only in their own folder: `logs/0xtitan6/` or `logs/benny/`, one file per day named `YYYY-MM-DD.md`, using the template in [logs/README.md](logs/README.md). At the end of a work session, offer to write or update that day's entry for the person you're working with. Never edit the other person's folder.

## Rules

- Never commit secrets: API keys, X credentials, NEAR account keys. They go in `.env` (git-ignored) locally and in host environment variables on the server.
- Juror calls to NEAR AI Cloud use `stream: false` (see README, "The jury").
- Models never choose contract calls or payments (see README, "Known limits").
