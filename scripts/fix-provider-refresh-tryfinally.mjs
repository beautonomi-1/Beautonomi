/**
 * Wraps provider app pull-to-refresh handlers in try/finally so setRefreshing(false) always runs.
 * Run from repo root: node scripts/fix-provider-refresh-tryfinally.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../apps/provider/app/(app)");

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** Simple: await refresh(); */
const simple = /(\n[ \t]*)setRefreshing\(true\);\s*\n([ \t]*)await refresh\(\);\s*\n([ \t]*)setRefreshing\(false\);/g;

let fixed = 0;
for (const f of walk(root)) {
  let s = fs.readFileSync(f, "utf8");
  const orig = s;

  s = s.replace(simple, (_m, pre, i1) => {
    return `${pre}setRefreshing(true);\n${i1}try {\n${i1}  await refresh();\n${i1}} finally {\n${i1}  setRefreshing(false);\n${i1}}`;
  });

  if (s !== orig) {
    fs.writeFileSync(f, s);
    fixed++;
    console.log("updated:", path.relative(process.cwd(), f));
  }
}

console.log(`Done. Files updated: ${fixed}`);
