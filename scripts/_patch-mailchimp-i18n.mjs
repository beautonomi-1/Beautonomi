import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "packages/i18n/src/locales");
const reps = [
  [
    "Note: For programmatic email sending, Mailchimp uses the Transactional API (Mandrill). Get your API key from Mailchimp → Account → Extras → API keys → Transactional API.",
    "Use a Mailchimp Transactional API key from Mailchimp Transactional → Settings → API Keys (not Marketing keys from Profile → Extras → API keys). Verify your sending domain (SPF/DKIM) before sending.",
  ],
  [
    "Get your API key from Mailchimp Account → Extras → API keys. Format: xxxxx-us1 (includes datacenter).",
    "Create a key in your Mailchimp Transactional account (Settings → API Keys). Marketing API keys ending in -us1 are not supported here.",
  ],
  ['"mailchimpApiKey": "Mailchimp API Key"', '"mailchimpApiKey": "Mailchimp Transactional API Key"'],
  ['"placeholderMailchimp": "xxxxx-us1"', '"placeholderMailchimp": "Your Transactional API key"'],
  ['"placeholderMailchimp": "xxxx-us1"', '"placeholderMailchimp": "Your Transactional API key"'],
  ['"placeholderMailchimp": "xxx-us1"', '"placeholderMailchimp": "Your Transactional API key"'],
];

const mobileWaHint =
  '          "whatsappCampaignLimitHint": "WhatsApp requires end-user opt-in. Freeform campaign text only works within the 24-hour customer service window after a user messages you; otherwise Meta requires approved Twilio Content Templates. Integration tests may succeed in sandbox or active sessions while bulk campaigns fail outside those rules.",';

const mobileKey =
  '          "testConnectionMailchimpOnly": "Test connection is for Mailchimp Transactional only. SendGrid: use Send test email.",';
const waKey =
  '            "whatsappCampaignLimitHint": "WhatsApp requires end-user opt-in. Freeform campaign text only works within the 24-hour customer service window after a user messages you; otherwise Meta requires approved Twilio Content Templates. Integration tests may succeed in sandbox or active sessions while bulk campaigns fail outside those rules.",';

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let c = fs.readFileSync(path.join(dir, f), "utf8");
  for (const [a, b] of reps) c = c.split(a).join(b);
  if (!c.includes("testConnectionMailchimpOnly") && c.includes('"placeholderMailchimp": "Your Transactional API key"')) {
    c = c.replace(
      '"placeholderMailchimp": "Your Transactional API key",',
      `"placeholderMailchimp": "Your Transactional API key",\n${mobileKey}`,
    );
  }
  if (!c.includes('"whatsappCampaignLimitHint"') && c.includes('"enableWhatsapp": "Enable WhatsApp"')) {
    c = c.replace(
      '"enableWhatsapp": "Enable WhatsApp",',
      `"enableWhatsapp": "Enable WhatsApp",\n${mobileWaHint}`,
    );
  }
  if (!c.includes("whatsappCampaignLimitHint") && c.includes("whatsappFromNumberHint")) {
    const marker =
      '"whatsappFromNumberHint": "Your Twilio WhatsApp number in E.164 format (e.g., +14155238886). For sandbox testing, use +14155238886. For production, you need a verified WhatsApp Business number. The system will automatically add the \\"whatsapp:\\" prefix.",';
    if (c.includes(marker)) {
      c = c.replace(marker, `${marker}\n${waKey}`);
    }
  }
  fs.writeFileSync(path.join(dir, f), c);
}
console.log("done");
