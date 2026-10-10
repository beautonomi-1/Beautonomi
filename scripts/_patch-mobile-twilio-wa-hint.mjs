import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "packages/i18n/src/locales");
const hint =
  '          "whatsappCampaignLimitHint": "WhatsApp requires end-user opt-in. Freeform campaign text only works within the 24-hour customer service window after a user messages you; otherwise Meta requires approved Twilio Content Templates. Integration tests may succeed in sandbox or active sessions while bulk campaigns fail outside those rules.",';

const needle =
  /("title": "SMS & WhatsApp",[\s\S]*?"enableWhatsapp": "[^"]+",)\n(\s*"whatsappFromNumber")/;

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let c = fs.readFileSync(path.join(dir, f), "utf8");
  const m = c.match(needle);
  if (!m) continue;
  const segment = m[0];
  if (segment.includes("whatsappCampaignLimitHint")) continue;
  c = c.replace(needle, `$1\n${hint}\n$2`);
  fs.writeFileSync(path.join(dir, f), c);
}
console.log("mobile wa hint done");
