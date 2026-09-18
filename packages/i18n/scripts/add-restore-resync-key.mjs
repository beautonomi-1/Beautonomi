import fs from "fs";
import path from "path";

const dir = path.join(import.meta.dirname, "../src/locales");
const key = "restoreResyncBody";
const val = "Your subscription was synced from your App Store billing records.";

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, "utf8");
  if (s.includes(`"${key}"`)) continue;
  if (!s.includes('"restoreCompleteBody"')) continue;
  s = s.replace(
    /("restoreCompleteBody":\s*"[^"]*"),/,
    `$1,\n          "${key}": "${val}",`,
  );
  fs.writeFileSync(p, s);
  console.log("patched", f);
}
