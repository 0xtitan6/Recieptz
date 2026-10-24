import { readFileSync } from "node:fs";
import { runCheck } from "../src/check.js";

const cases = JSON.parse(readFileSync("eval/claims.json", "utf8")) as { text: string; expect: string }[];
let pass = 0;
for (const c of cases) {
  const r = await runCheck(c.text);
  const got = r.declined ? "decline" : r.receipt.verdict;
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  expected=${c.expect} got=${got}  | ${c.text}`);
}
console.log(`\n${pass}/${cases.length} passed`);
