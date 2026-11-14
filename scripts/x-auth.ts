// One-time: get OAuth 1.0a access tokens for the BOT account (not the app owner) via PIN flow.
// Run: npx tsx scripts/x-auth.ts   (needs X_API_KEY and X_API_SECRET in .env)
// Open the printed link while logged in as the bot account, authorize, paste the PIN.
import "dotenv/config";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { TwitterApi } from "twitter-api-v2";

const appKey = process.env.X_API_KEY, appSecret = process.env.X_API_SECRET;
if (!appKey || !appSecret) throw new Error("Set X_API_KEY and X_API_SECRET in .env first");

const link = await new TwitterApi({ appKey, appSecret }).generateAuthLink("oob");
console.log(`\n1. Log in to X as the BOT account.\n2. Open: ${link.url}\n3. Authorize, then paste the PIN here.\n`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
const pin = (await rl.question("PIN: ")).trim();
rl.close();

const { accessToken, accessSecret, screenName } = await new TwitterApi({
  appKey, appSecret, accessToken: link.oauth_token, accessSecret: link.oauth_token_secret,
}).login(pin);

// Replace any existing token lines, then append the new ones. Values are never printed.
const env = readFileSync(".env", "utf8").split("\n").filter((l) => !/^X_ACCESS_(TOKEN|SECRET)=/.test(l)).join("\n");
writeFileSync(".env", env.replace(/\n*$/, "\n"));
appendFileSync(".env", `X_ACCESS_TOKEN=${accessToken}\nX_ACCESS_SECRET=${accessSecret}\n`);
console.log(`Saved access token for @${screenName} to .env`);
