import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const m = JSON.parse(fs.readFileSync(path.join(__dirname, "../_maps/t-sa-mobile-i18n-fix-leftover.json"), "utf8"));

const reportingKey =
  "To report a post, comment, or message, open it and choose Report from the menu (⋯). Reports go to our trust & safety team.";
const introKey =
  "Reports go to our trust & safety queue. Include who you're reporting and what happened. Urgent danger? Call emergency services first, then contact Partner support.";
const supportKey = "Don't know their handle? Open a Partner support ticket instead";

for (const loc of ["af", "st", "nso", "tn", "ts", "ve"]) {
  const file = path.join(localesDir, `${loc}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  d.provider.mobile.screens.reportUser.intro = m[introKey][loc];
  if (loc === "af") {
    d.provider.mobile.screens.reportUser.supportFallback = m[supportKey].af;
  }
  if (loc === "ve") {
    const hint = m[reportingKey].ve;
    d.provider.mobile.screens.contentSafety.reportingHint = hint;
    d.customer.mobile.screens.contentSafety.reportingHint = hint;
  }
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
}
console.log("ok");
