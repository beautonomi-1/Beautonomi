/**
 * Replace `ZAR ${inner}` with `fm(cleanInner, currencyCode)` for report CSV export.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "../src/app/provider/reports/utils/export.ts");
let s = fs.readFileSync(file, "utf8");

function innerToExpr(inner) {
  let e = inner.trim();
  if (/^Number\(.+\)\.toLocaleString\(\)$/.test(e)) {
    return e.replace(/\.toLocaleString\(\)$/, "");
  }
  e = e.replace(/\?\.toLocaleString\(\)\s*\|\|\s*0/g, "");
  e = e.replace(/\.toLocaleString\(\)\s*\|\|\s*0/g, "");
  e = e.replace(/\?\.toLocaleString\(\)/g, "");
  e = e.replace(/\.toLocaleString\(\)/g, "");
  return e;
}

s = s.replace(/`ZAR \$\{([^}]+)\}`/g, (_, inner) => {
  const expr = innerToExpr(inner);
  return "`fm(" + expr + ", currencyCode)`";
});

fs.writeFileSync(file, s);
console.log("Patched", file);
