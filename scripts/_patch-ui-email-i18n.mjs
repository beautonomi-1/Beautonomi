import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "packages/i18n/src/locales");

const reps = [
  [
    '"enableCampaignsHint": "Enable email marketing campaigns using SendGrid or Mailchimp"',
    '"enableCampaignsHint": "Enable email marketing campaigns using SendGrid or Mailchimp Transactional (Mandrill)"',
  ],
  [
    '"connectSendgridOrMailchimpToRun": "Connect SendGrid or Mailchimp to run effective email marketing campaigns"',
    '"connectSendgridOrMailchimpToRun": "Connect SendGrid or Mailchimp Transactional (Mandrill) to run email marketing campaigns"',
  ],
  ['"providerMailchimp": "Mailchimp",', '"providerMailchimp": "Mailchimp Transactional",'],
  [
    '"subtitle": "SendGrid or Mailchimp",',
    '"subtitle": "SendGrid or Mailchimp Transactional",',
  ],
];

const webInsert = `"mailchimpApiKey": "Mailchimp Transactional API Key",
            "placeholderMailchimpApiKey": "Your Transactional API key",
            "providerSwitchRequiresNewKey": "Switching email providers requires entering a new API key for the selected provider.",`;

const webNeedle = `"mailchimpApiKey": "Mailchimp Transactional API Key",`;

const mobileBlock = `"providerMailchimp": "Mailchimp Transactional",
          "mailchimpNote": "Use a Mailchimp Transactional API key from Transactional → Settings → API Keys (not Marketing keys from Profile → Extras). Verify your sending domain (SPF/DKIM) before sending.",
          "mailchimpKeyHint": "Marketing API keys ending in -us1 are not supported. Create a key in Mailchimp Transactional → Settings → API Keys.",
          "mailchimpFromHint": "Use a from-address on your domain verified in Mailchimp Transactional (SPF/DKIM).",
          "mailchimpTestHint": "Test connection verifies your Transactional API key. Send test email checks delivery (integration must be enabled).",
          "providerSwitchRequiresNewKey": "Enter a new API key when switching between SendGrid and Mailchimp Transactional.",`;

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  let c = fs.readFileSync(path.join(dir, f), "utf8");
  for (const [a, b] of reps) c = c.split(a).join(b);

  if (!c.includes("placeholderMailchimpApiKey") && c.includes(webNeedle)) {
    c = c.replace(webNeedle, webInsert);
  } else if (!c.includes("placeholderMailchimpApiKey") && c.includes('"mailchimpApiKey": "Mailchimp API Key"')) {
    c = c.replace(
      '"mailchimpApiKey": "Mailchimp API Key",',
      webInsert,
    );
  }

  if (c.includes('"emailIntegration":') && !c.includes('"mailchimpNote": "Use a Mailchimp Transactional API key from Transactional')) {
    c = c.replace(
      /"providerMailchimp": "Mailchimp Transactional",\s*"configuration":/,
      `${mobileBlock}\n          "configuration":`,
    );
    if (!c.includes('"mailchimpNote": "Use a Mailchimp Transactional API key from Transactional')) {
      c = c.replace(
        /"providerMailchimp": "Mailchimp",\s*"configuration":/,
        `${mobileBlock}\n          "configuration":`,
      );
    }
  }

  fs.writeFileSync(path.join(dir, f), c);
}
console.log("ui email i18n patch done");
