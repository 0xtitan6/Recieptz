// X bot: polls mentions of the bot account, checks the tagged post, replies with the verdict and a lookup link.
// Run: npm run bot
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TwitterApi, type TweetV2 } from "twitter-api-v2";
import { runCheck } from "./check.js";
import { COVERED_DOMAINS } from "./evidence/index.js";
import { PUBLISHABLE } from "./types.js";

const POLL_MS = Number(process.env.BOT_POLL_MS ?? 60_000);
const LOOKUP_URL = (process.env.LOOKUP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const STATE = "state/bot.json";

const x = new TwitterApi({
  appKey: process.env.X_API_KEY ?? "",
  appSecret: process.env.X_API_SECRET ?? "",
  accessToken: process.env.X_ACCESS_TOKEN ?? "",
  accessSecret: process.env.X_ACCESS_SECRET ?? "",
});

interface State { sinceId?: string; handled: string[] }
const load = (): State => existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { handled: [] };
const save = (s: State) => { mkdirSync("state", { recursive: true }); writeFileSync(STATE, JSON.stringify(s)); };

/** Strip @handles so the check sees only the claim. */
const clean = (t: string) => t.replace(/(^|\s)@\w+/g, " ").replace(/https:\/\/t\.co\/\w+/g, "").trim();

async function handle(mention: TweetV2, parents: Map<string, TweetV2>): Promise<string> {
  // §7.2: check the post that was replied to (the claim), not the tag itself.
  const parentId = mention.referenced_tweets?.find((r) => r.type === "replied_to")?.id;
  const parent = parentId ? parents.get(parentId) : undefined;
  const claimPost = parent ?? mention;
  const text = clean(claimPost.text);
  if (!text) return "Tag me in a reply to a post with a factual claim and I'll check it.";

  const r = await runCheck(text, claimPost.id);
  if (r.declined && r.reason === "out-of-coverage")
    return `I can't check this against primary records yet. Covered today: ${COVERED_DOMAINS.join(", ")}.`;
  if (r.declined) return "I didn't find a checkable public claim in that post.";
  if (r.uncovered) return `I can't check this against primary records yet. Covered today: ${COVERED_DOMAINS.join(", ")}.`;

  const rc = r.receipt;
  const link = `\nReceipt, verified on NEAR: ${LOOKUP_URL}/run/${rc.runId}`;
  // Only a publishable verdict cites a source; otherwise the evidence didn't settle the claim.
  if (!PUBLISHABLE.includes(rc.verdict)) {
    const why = rc.verdict === "Contested"
      ? "The jury split and the evidence doesn't settle it."
      : "No primary record I can check covers this claim.";
    return `${rc.verdict}. ${why}${link}`;
  }
  const src = rc.evidence[0]?.name ?? "primary record";
  return `${rc.verdict} (confidence ${rc.confidence.toFixed(2)}). Source: ${src}.${link}`;
}

async function poll(meId: string) {
  const s = load();
  const res = await x.v2.userMentionTimeline(meId, {
    ...(s.sinceId ? { since_id: s.sinceId } : { max_results: 5 }),
    expansions: ["referenced_tweets.id"],
    "tweet.fields": ["referenced_tweets", "text"],
  });
  const mentions = res.tweets ?? [];
  const parents = new Map((res.includes?.tweets ?? []).map((t) => [t.id, t]));
  if (res.meta?.newest_id) s.sinceId = res.meta.newest_id;

  // Oldest first, one at a time.
  for (const m of [...mentions].reverse()) {
    if (s.handled.includes(m.id)) continue;
    // §7.1: record before checking, so a crash can't cause a second on-chain run.
    s.handled.push(m.id);
    save(s);
    try {
      const reply = await handle(m, parents);
      await x.v2.reply(reply.slice(0, 280), m.id);
      console.log(`replied to ${m.id}: ${reply.split("\n")[0]}`);
    } catch (e) {
      console.error(`mention ${m.id} failed:`, (e as Error).message);
    }
  }
  save(s);
}

const me = await x.v2.me();
console.log(`bot running as @${me.data.username}, polling every ${POLL_MS / 1000}s`);
for (;;) {
  try { await poll(me.data.id); } catch (e) { console.error("poll failed:", (e as Error).message); }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
