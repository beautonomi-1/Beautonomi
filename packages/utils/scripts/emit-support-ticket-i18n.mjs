import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const distIndex = path.join(dir, "../dist/index.mjs");

if (!fs.existsSync(distIndex)) {
  console.error("Run `pnpm build` in packages/utils before emit-support-ticket-i18n.mjs");
  process.exit(1);
}

const mod = await import(pathToFileURL(distIndex).href);
const { SUPPORT_CONTEXT_TYPE_OPTIONS, SUPPORT_TICKET_CATEGORY_GROUPS_RICH } = mod;

const groups = Object.fromEntries(SUPPORT_TICKET_CATEGORY_GROUPS_RICH.map((g) => [g.id, g.label]));
const items = Object.fromEntries(
  SUPPORT_TICKET_CATEGORY_GROUPS_RICH.flatMap((g) => g.items.map((i) => [i.value, i.label])),
);
const contextTypes = Object.fromEntries(SUPPORT_CONTEXT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const enPath = path.join(dir, "..", "..", "i18n", "src", "locales", "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
en.support = { ...(en.support ?? {}), ticketCategories: { groups, items, contextTypes } };
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
console.log("updated en.json support.ticketCategories", Object.keys(items).length, "items");
