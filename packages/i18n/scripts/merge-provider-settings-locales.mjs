#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const extractPath = path.join(__dirname, "../settings-strings-extract.json");

const SKIP_STRINGS = new Set([
  "Home",
  "Provider",
  "Settings",
  "Retry",
  "Loading...",
  "Saving...",
  "Save Changes",
]);

function toKey(str, used) {
  let base = String(str)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("")
    .replace(/^\d/, "n$&");
  if (!base) base = "text";
  let k = base;
  let n = 2;
  while (used.has(k)) {
    k = `${base}${n++}`;
  }
  used.add(k);
  return k;
}

function pageSlug(rel) {
  return rel.replace(/\/page\.tsx$/, "").replace(/\[vendor\]/g, "vendor");
}

function flattenExtra(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[k] = v;
    else if (v && typeof v === "object") {
      if (Object.values(v).every((x) => typeof x === "string")) {
        out[k] = v;
      } else {
        Object.assign(out, flattenExtra(v, k));
      }
    }
  }
  return out;
}

// Keep in sync with wire-provider-settings-i18n.mjs EXTRA block
const EXTRA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "provider-settings-extra.json"), "utf8"),
);

const extracted = JSON.parse(fs.readFileSync(extractPath, "utf8"));
const pagesLocale = {};

for (const rel of new Set([...Object.keys(extracted), ...Object.keys(EXTRA)])) {
  const slug = pageSlug(rel);
  const used = new Set();
  pagesLocale[slug] = {};
  for (const str of extracted[rel] || []) {
    if (!str || str.length < 2 || SKIP_STRINGS.has(str)) continue;
    pagesLocale[slug][toKey(str, used)] = str;
  }
  if (EXTRA[rel]) {
    Object.assign(pagesLocale[slug], EXTRA[rel]);
  }
}

const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
en.web.provider.settings.common = {
  saveChanges: "Save Changes",
  saving: "Saving...",
  loading: "Loading...",
  loadFailed: "Failed to load settings",
  ...(en.web.provider.settings.common || {}),
};
en.web.provider.settings.appointments = {
  pageTitle: "Appointment Settings",
  pageSubtitle: "Configure default appointment status and confirmation behavior",
  breadcrumb: "Appointment Settings",
  loading: "Loading appointment settings...",
  loadFailed: "Failed to load appointment settings",
  saved: "Appointment settings saved successfully",
  saveFailed: "Failed to save settings",
  defaultAppointmentStatus: "Default Appointment Status",
  defaultAppointmentStatusHint:
    "Choose the default status for new appointments when they are created",
  defaultStatusFootnote:
    "New appointments will be created with this status unless specified otherwise",
  autoConfirm: "Auto-Confirm Appointments",
  autoConfirmHint:
    'Automatically confirm appointments when they are created (if default status is "Pending")',
  requireConfirmation: "Require Confirmation",
  requireConfirmationHint:
    'Require manual confirmation before appointments are marked as "Booked"',
  requireConfirmationFootnote:
    "Applies to customer online booking requests only. Walk-ins and appointments you create in the provider portal are confirmed immediately.",
  lifecycleTitle: "Booking lifecycle timing",
  lifecycleHint:
    "Control how long customers wait for confirmation and when open appointments move into close-out.",
  confirmationSla: "Confirmation SLA (hours)",
  confirmationSlaHint:
    "Target time to respond to new online requests during business hours.",
  releaseUnconfirmed: "Release unconfirmed (hours before slot)",
  releaseUnconfirmedHint:
    "Pending online requests expire this many hours before the appointment time.",
  closeoutGraceSalon: "Close-out grace — salon (minutes)",
  closeoutGraceAtHome: "Close-out grace — at home (minutes)",
  lateArrivalGrace: "Late arrival grace (minutes)",
  lateArrivalGraceHint:
    "Extra minutes after the scheduled start before a salon client is treated as late.",
  acceptCustomRequests: "Accept custom service requests",
  acceptCustomRequestsHint:
    "When off, customers see that you are not accepting custom requests from the app or web profile.",
  infoAlert:
    "These settings apply to all new appointments created through the provider portal. Existing appointments are not affected.",
  lastUpdated: "Last updated: {{date}}",
  loadFailedTitle: "Failed to load settings",
  retry: "Retry",
  ...(en.web.provider.settings.appointments || {}),
};
en.web.provider.settings.pages = pagesLocale;
fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);
console.log(`Merged ${Object.keys(pagesLocale).length} page groups into en.json`);
