import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rem = JSON.parse(fs.readFileSync(path.join(root, "_unique-remaining-en.json"), "utf8"));
const dir = path.join(root, "_maps");
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(root, "_deltas"), { recursive: true });
const SIZE = 400;
for (let i = 0; i < rem.length; i += SIZE) {
  const chunk = rem.slice(i, i + SIZE);
  const n = String(Math.floor(i / SIZE) + 1).padStart(2, "0");
  fs.writeFileSync(path.join(dir, `en-${n}.json`), JSON.stringify(chunk, null, 2));
}
console.log("chunks", Math.ceil(rem.length / SIZE), "total", rem.length);
