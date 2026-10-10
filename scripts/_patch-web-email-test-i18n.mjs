import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "packages/i18n/src/locales");
const needle =
  '"testHint": "Send a test email to verify your integration is working",';
const insert = `"testHint": "Send a test email to verify your integration is working",
            "mailchimpTestHint": "Test connection checks your Mailchimp Transactional API key. Send test email verifies sending domain and delivery (integration must be enabled).",
            "testConnection": "Test Connection",
            "testConnectionSuccess": "Mailchimp Transactional connection successful",
            "testConnectionMailchimpOnly": "Connection ping is only for Mailchimp Transactional. Send a test email instead.",`;

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let c = fs.readFileSync(path.join(dir, f), "utf8");
  if (!c.includes(needle) || c.includes('"mailchimpTestHint"')) continue;
  c = c.replace(needle, insert);
  fs.writeFileSync(path.join(dir, f), c);
}
console.log("web email test i18n done");
