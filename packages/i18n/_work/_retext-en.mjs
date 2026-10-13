/** Update English source for ambiguous new keys and drop stale translations so they get refilled. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "../scripts/_safe-write-json.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "../src/locales");
const RP = "web.provider.reports.pages.payments/card-machine-reconciliation.";
const M = "provider.mobile.screens.bookingDetail.";
const W = "web.provider.bookings.detail.";
const updates = Object.fromEntries(
  Object.entries({
    [`${M}cancelRefundTo`]: "Refund the paid amount to",
    [`${W}dialogs.cancelRefundTo`]: "Refund the paid amount to",
    [`${M}yocoRefundRecordCta`]: "Refunded on the machine — record the refund",
    [`${W}refund.yocoRecordCta`]: "Refunded on the machine — record the refund",
    [`${RP}match`]: "Amount match",
    [`${RP}order`]: "Order number",
    [`${RP}awaitingSince`]: "Waiting since",
    [`${RP}openBooking`]: "Open the booking to record it",
  }).filter(([k]) => process.argv.slice(2).length === 0 || process.argv.slice(2).some((a) => k.endsWith(a))),
);

const walk = (o, k) => {
  const parts = k.split(".");
  let cur = o;
  for (const p of parts.slice(0, -1)) cur = cur?.[p];
  return [cur, parts[parts.length - 1]];
};

const newKeysPath = path.join(here, "_new-keys.json");
const newKeys = JSON.parse(fs.readFileSync(newKeysPath, "utf8"));
for (const [k, v] of Object.entries(updates)) newKeys[k] = v;
fs.writeFileSync(newKeysPath, JSON.stringify(newKeys, null, 1));

for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const file = path.join(dir, f);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const [k, v] of Object.entries(updates)) {
    const [parent, leaf] = walk(json, k);
    if (!parent || !(leaf in parent)) continue;
    if (f === "en.json") parent[leaf] = v;
    else delete parent[leaf];
    changed = true;
  }
  if (changed) safeWriteJson(file, json);
}
console.log("done");
