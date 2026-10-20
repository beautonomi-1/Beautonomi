/**
 * One-off parity patch: copy support-assistant mobile keys from en.json into all locale files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../packages/i18n/src/locales");

const EN = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));

const providerNew = EN.provider?.mobile?.screens?.supportTicketNew ?? {};
const providerDetail = EN.provider?.mobile?.screens?.supportTicketDetail ?? {};
const customerNew = EN.customer?.mobile?.screens?.supportTicketNew ?? {};
const customerDetail = EN.customer?.mobile?.screens?.supportTicketDetail ?? {};

const CHAT_NEW_KEYS = [
  "chatDefaultSubject",
  "continueToChat",
  "useFullForm",
  "safetyUseForm",
  "chatAiDisclaimer",
  "startChat",
  "chatBack",
  "sentToTeam",
];
const providerNewKeys = CHAT_NEW_KEYS;
const providerDetailKeys = [
  "handoffTitle",
  "handoffBody",
  "aiDisclaimer",
  "assistantName",
  "talkToPerson",
  "didThisHelp",
  "attachmentsAfterHuman",
  "assistantTyping",
];
const customerNewKeys = CHAT_NEW_KEYS;
const customerDetailKeys = [
  "handoffTitle",
  "handoffBody",
  "aiDisclaimer",
  "assistantName",
  "talkToPerson",
  "didThisHelp",
  "attachmentsAfterHuman",
  "assistantTyping",
];

function ensure(obj, keys, source) {
  for (const key of keys) {
    if (source[key] != null && obj[key] == null) {
      obj[key] = source[key];
    }
  }
}

const files = fs.readdirSync(localesDir).filter((f) => f.endsWith(".json") && f !== "en.json");

for (const file of files) {
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  data.provider ??= {};
  data.provider.mobile ??= {};
  data.provider.mobile.screens ??= {};
  data.provider.mobile.screens.supportTicketNew ??= {};
  data.provider.mobile.screens.supportTicketDetail ??= {};
  data.customer ??= {};
  data.customer.mobile ??= {};
  data.customer.mobile.screens ??= {};
  data.customer.mobile.screens.supportTicketNew ??= {};
  data.customer.mobile.screens.supportTicketDetail ??= {};

  ensure(data.provider.mobile.screens.supportTicketNew, providerNewKeys, providerNew);
  ensure(data.provider.mobile.screens.supportTicketDetail, providerDetailKeys, providerDetail);
  ensure(data.customer.mobile.screens.supportTicketNew, customerNewKeys, customerNew);
  ensure(data.customer.mobile.screens.supportTicketDetail, customerDetailKeys, customerDetail);

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("patched", file);
}
