#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(
  __dirname,
  "../../../apps/provider/app/(app)/(tabs)/more/bookings/[id].tsx",
);
let s = fs.readFileSync(filePath, "utf8");

s = s.replace(
  /Alert\.alert\(\s*"Required",\s*"Enter the 8-character code from the customer.s QR, paste the full scanned JSON, or use Scan QR\."\s*\)/,
  'Alert.alert(bk("requiredTitle"), bk("qrRequiredBody"))',
);

s = s.replaceAll(
  '{ text: "Cancel", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }',
  '{ text: bk("cancelCta"), style: "cancel" }, { text: bk("refreshCta"), onPress: () => refresh() }',
);
s = s.replaceAll(
  '[{ text: "Cancel", style: "cancel" }, { text: "Refresh", onPress: () => refresh() }]',
  '[{ text: bk("cancelCta"), style: "cancel" }, { text: bk("refreshCta"), onPress: () => refresh() }]',
);

const enPath = path.join(__dirname, "../src/locales/en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const bd = en.provider.mobile.screens.bookingDetail;
if (!bd.removeCta) {
  bd.removeCta = "Remove";
  fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
  console.log("added removeCta to en.json");
}

fs.writeFileSync(filePath, s);
console.log("fixups applied");
