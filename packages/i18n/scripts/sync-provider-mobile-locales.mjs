import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

const mobileBlock = en.provider.mobile;
const walkInSaleBlock = en.provider.walkInSale;
const salesScreenBlock = en.provider.salesScreen;

const mobileJson = JSON.stringify(mobileBlock, null, 2)
  .split("\n")
  .map((line, i) => (i === 0 ? line : `    ${line}`))
  .join("\n");

const walkInJson = JSON.stringify(walkInSaleBlock, null, 2)
  .split("\n")
  .map((line, i) => (i === 0 ? line : `    ${line}`))
  .join("\n");

const salesJson = JSON.stringify(salesScreenBlock, null, 2)
  .split("\n")
  .map((line, i) => (i === 0 ? line : `    ${line}`))
  .join("\n");

const insertBlock = `    "walkInSale": ${walkInJson.replace(/^/m, "").trimEnd()},\n    "salesScreen": ${salesJson.replace(/^/m, "").trimEnd()},\n    "mobile": ${mobileJson.replace(/^/m, "").trimEnd()},\n`;

for (const file of fs.readdirSync(localesDir)) {
  if (!file.endsWith(".json") || file === "en.json") continue;
  const filePath = path.join(localesDir, file);
  let s = fs.readFileSync(filePath, "utf8");
  if (s.includes('"walkInSale"') && s.includes('"provider.mobile"')) continue;
  if (!s.includes('"moreTab"')) continue;

  if (!s.includes('"walkInSale"')) {
    s = s.replace(
      /(\s+"staffPrefix": "[^"]+"\s*\n\s*\},\s*\n)(\s+"moreTab":)/,
      `$1${insertBlock}$2`,
    );
  } else if (!s.includes('"mobile": {\n      "components"')) {
    s = s.replace(
      /(\s+"walkInSale": \{[\s\S]*?\},\s*\n)(\s+"moreTab":)/,
      `$1    "mobile": ${mobileJson.replace(/^/m, "").trimEnd()},\n$2`,
    );
  }

  fs.writeFileSync(filePath, s);
  console.log(`synced ${file}`);
}
