#!/usr/bin/env node
/**
 * Backfill missing web.provider.* keys referenced in provider web code.
 * Uses key-matches.txt + heuristics for English defaults.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(__dirname, "../../..");
const enPath = path.join(__dirname, "../src/locales/en.json");

function flat(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flat(value, full, out);
    else out.set(full, String(value ?? ""));
  }
  return out;
}

function unflatten(flatMap) {
  const root = {};
  for (const [pathKey, value] of flatMap) {
    const parts = pathKey.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

function setDeep(obj, pathKey, value) {
  const parts = pathKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const enFlat = flat(en);

const roots = [
  path.join(repo, "apps/web/src/app/provider"),
  path.join(repo, "apps/web/src/components/provider"),
  path.join(repo, "apps/web/src/components/provider-portal"),
];
const re = /t\(\s*["'`](web\.provider[^"'`$]+)["'`]/g;
const missing = new Set();

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp);
    else if (/\.(tsx|ts)$/.test(ent.name)) {
      const src = fs.readFileSync(fp, "utf8");
      let m;
      while ((m = re.exec(src))) {
        const key = m[1];
        if (!enFlat.has(key)) missing.add(key);
      }
    }
  }
}
for (const root of roots) walk(root);

// Known English from extraction artifacts + portal aliases
const EXPLICIT = {
  "web.provider.bookings.appointmentCreate.couldNotCreateRecurring": "Could not create repeating series",
  "web.provider.bookings.appointmentCreate.recurringFailedTrySingle":
    "{{reason}}. Try a single booking instead.",
  "web.provider.bookings.detail.toast.bookingChanged": "This booking changed, reload",
  "web.provider.bookings.detail.toast.markedNoShow": "Booking marked as no-show",
  "web.provider.bookings.detail.toast.noShowFailed": "Failed to mark as no-show",
  "web.provider.bookings.detail.toast.cancelled": "Booking cancelled",
  "web.provider.bookings.detail.toast.cancelFailed": "Failed to cancel booking",
  "web.provider.bookings.detail.toast.rescheduled": "Booking rescheduled",
  "web.provider.bookings.detail.toast.rescheduleFailed": "Failed to reschedule booking",
  "web.provider.bookings.detail.toast.paymentRecorded": "Booking payment recorded",
  "web.provider.bookings.detail.toast.markedPaid": "Marked as paid",
  "web.provider.bookings.detail.toast.markPaidFailed": "Failed to mark as paid",
  "web.provider.bookings.detail.toast.noBalance": "There is no remaining balance on this booking.",
  "web.provider.bookings.detail.toast.noBalanceCollect": "No balance to collect",
  "web.provider.bookings.detail.toast.noBalanceOverpaid": "This booking is overpaid",
  "web.provider.bookings.detail.toast.cardPaymentFailed": "Card payment failed",
  "web.provider.bookings.detail.toast.chargeSendFailed": "Failed to send charge",
  "web.provider.bookings.detail.toast.chargeSent": "Charge sent to client",
  "web.provider.bookings.detail.toast.chargeMarkedPaid": "Charge marked as paid",
  "web.provider.bookings.detail.toast.documentUploaded": "Document uploaded",
  "web.provider.bookings.detail.toast.uploadFailed": "Upload failed",
  "web.provider.bookings.detail.toast.enterValidAmount": "Enter a valid amount",
  "web.provider.bookings.detail.toast.enterDescription": "Enter a description",
  "web.provider.bookings.detail.toast.enterRefundReason": "Enter a refund reason",
  "web.provider.bookings.detail.toast.emailRequired": "Email is required",
  "web.provider.bookings.detail.toast.phoneRequired": "Phone number is required",
  "web.provider.bookings.detail.toast.refundFailed": "Refund failed",
  "web.provider.bookings.detail.toast.refundCash": "Refund issued (cash)",
  "web.provider.bookings.detail.toast.refundWallet": "Refund issued (wallet)",
  "web.provider.bookings.detail.toast.refundExceeds": "Refund cannot exceed {{amount}}",
  "web.provider.bookings.detail.toast.reminderSent": "Reminder sent",
  "web.provider.bookings.detail.toast.reminderFailed": "Failed to send reminder",
  "web.provider.bookings.detail.toast.notesSaved": "Notes saved",
  "web.provider.bookings.detail.toast.notesSaveFailed": "Failed to save notes",
  "web.provider.bookings.detail.toast.journeyStarted": "Journey started",
  "web.provider.bookings.detail.toast.journeyFailed": "Failed to start journey",
  "web.provider.bookings.detail.toast.etaUpdated": "ETA updated to {{minutes}} minutes",
  "web.provider.bookings.detail.toast.etaFailed": "Failed to update ETA",
  "web.provider.bookings.detail.toast.etaRange": "Enter ETA between 1 and 180 minutes",
  "web.provider.bookings.detail.toast.markedArrived": "Marked as arrived",
  "web.provider.bookings.detail.toast.markArrivedFailed": "Failed to mark as arrived",
  "web.provider.bookings.detail.toast.serviceStarted": "Service started",
  "web.provider.bookings.detail.toast.serviceCompleted": "Service completed",
  "web.provider.bookings.detail.toast.statusUpdated": "Booking status updated",
  "web.provider.bookings.detail.toast.statusUpdateFailed": "Failed to update booking status",
  "web.provider.bookings.detail.toast.cannotCharge": "Cannot charge this booking",
  "web.provider.bookings.detail.toast.cancellationNoticeSent": "Cancellation notice sent",
  "web.provider.bookings.detail.toast.cancellationNoticeFailed": "Failed to send cancellation notice",
  "web.provider.bookings.detail.toast.cancellationNoticeSendFailed": "Failed to send cancellation notice",
  "web.provider.bookings.detail.toast.confirmationResent": "Confirmation resent",
  "web.provider.bookings.detail.toast.codeSent": "Verification code sent",
  "web.provider.bookings.detail.toast.resendFailed": "Failed to resend",
  "web.provider.bookings.detail.toast.selectDateTime": "Select a date and time",
  "web.provider.bookings.detail.toast.noPermission": "You do not have permission for this action",
  "web.provider.bookings.detail.toast.permissionToCollect": "You do not have permission to collect payment",
  "web.provider.bookings.detail.toast.noPaystackTerminal": "No Paystack terminal configured",
  "web.provider.bookings.detail.toast.paystackPrepareFailed": "Could not prepare Paystack payment",
  "web.provider.bookings.detail.toast.missingReference": "Missing payment reference",
  "web.provider.bookings.detail.toast.missingSaleRecord": "Missing sale record",
  "web.provider.bookings.detail.toast.terminalFinalizeFailed":
    "The terminal payment succeeded but the sale could not be finalized. Check Sales for a pending entry.",
  "web.provider.bookings.detail.toast.verifyQrFailed": "Failed to verify QR",
  "web.provider.bookings.detail.toast.verifiedCanStart": "Customer verified – you can start the service.",
  "web.provider.bookings.detail.toast.overrideFailed": "Failed to override",
  "web.provider.bookings.detail.toast.overrideSuccess": "Override applied",
  "web.provider.bookings.detail.toast.overridePrompt": "Override verification?",
  "web.provider.bookings.detail.toast.notificationFailed": "Notification failed",
  "web.provider.bookings.detail.toast.notificationSendFailed": "Failed to send notification",
  "web.provider.bookings.detail.toast.reminderSentCustomer": "Reminder sent to customer",
  "web.provider.bookings.detail.toast.noReasonProvided": "No reason provided",
  "web.provider.bookings.detail.atHome.attemptsLogged_one": "{{count}} attempt logged.",
  "web.provider.bookings.detail.atHome.attemptsLogged_other": "{{count}} attempts logged.",
  "web.provider.bookings.detail.receipt.titleEmailed": "Receipt emailed",
  "web.provider.bookings.detail.receipt.titleEmailFailed": "Failed to email receipt",
  "web.provider.bookings.dayHub.appointmentsOnly_one": "{{count}} appointment",
  "web.provider.bookings.dayHub.appointmentsOnly_other": "{{count}} appointments",
  "web.provider.bookings.dayHub.blocksOnly_one": "{{count}} block",
  "web.provider.bookings.dayHub.blocksOnly_other": "{{count}} blocks",
};

// Parse key-matches.txt
const kmPath = path.join(repo, "_i18n_tmp/key-matches.txt");
if (fs.existsSync(kmPath)) {
  for (const line of fs.readFileSync(kmPath, "utf8").split("\n")) {
    const m = line.match(/^\s*"([^"]+)"\s*=>\s*(web\.provider[^\s(+]+)/);
    if (m) EXPLICIT[m[2].trim()] = m[1];
  }
}

function guessEnglish(key) {
  if (EXPLICIT[key]) return EXPLICIT[key];
  const leaf = key.split(".").pop() ?? key;
  const sibling = [...enFlat.entries()].find(([k]) => k.endsWith(`.${leaf}`) && k.startsWith("web.provider."));
  if (sibling) return sibling[1];
  const words = leaf
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

let added = 0;
for (const key of [...missing].sort()) {
  const value = guessEnglish(key);
  setDeep(en, key, value);
  enFlat.set(key, value);
  added += 1;
  console.log(`+ ${key} = ${value}`);
}

fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n");
console.log(`\nBackfilled ${added} keys into en.json`);
