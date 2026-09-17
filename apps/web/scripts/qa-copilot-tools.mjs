import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTool } from "@beautonomi/agent-tools";

const root = path.dirname(fileURLToPath(import.meta.url));
const planPath = path.join(root, "../src/lib/agents/copilot/plan-copilot-tools.ts");
const planFull = fs.readFileSync(planPath, "utf8");
const plan = planFull.split("export function appendReportDeepLinks")[0] ?? planFull;
const bound = fs.readFileSync(path.join(root, "../src/lib/agents/tools/bound-registry.ts"), "utf8");
const pushNames = [...plan.matchAll(/push\("([^"]+)"/g)]
  .map((m) => m[1])
  .filter((n) => n.includes(".") && !n.startsWith("-"));
const boundNames = [...bound.matchAll(/tool\("([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(pushNames)];
const missingBound = unique.filter((n) => !boundNames.includes(n));
const missingRegistry = unique.filter((n) => !getTool(n));

let ok = true;
if (missingBound.length) {
  console.error("MISSING BOUND:", missingBound);
  ok = false;
}
if (missingRegistry.length) {
  console.error("MISSING REGISTRY:", missingRegistry);
  ok = false;
}
if (ok) console.log(`OK: ${unique.length} planned tools wired and registered`);
process.exit(ok ? 0 : 1);
