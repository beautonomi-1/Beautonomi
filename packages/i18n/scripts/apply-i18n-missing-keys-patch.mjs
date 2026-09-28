#!/usr/bin/env node
/**
 * Deep-merge missing i18n keys into en.json and propagate translations to all full locales.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translate as translateSa } from "./_wave-a-translate.mjs";
import { translate as translateFrArSw } from "./_wave-a-fr-ar-sw.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "../src/locales");
const OVERLAYS = new Set(["en-GB", "en-US", "en-AU", "pt-BR", "es-MX"]);

const READINESS_ITEMS = {
  group_date: "Date",
  group_time: "Time slot",
  group_duration: "Duration",
  group_service: "Default service",
  group_staff: "Team member",
  group_address: "At-home address",
  group_participants: "Participants",
  booking_client: "Client",
  booking_services: "Services or products",
  booking_schedule: "Date & time",
  booking_staff: "Staff assignment",
  booking_location: "Service address",
  booking_intake: "Client forms",
  booking_recurring: "Repeating series",
};

const READINESS_CORE = {
  title: "Booking checklist · {{completed}}/{{total}}",
  next: "Next: {{label}}",
  a11ySummary: "{{completed}} of {{total}} booking requirements complete",
  jumpHint: "Jump to the next required section",
  showRequirements: "Show requirements",
  hideRequirements: "Hide requirements",
  participant: "Participant {{number}}",
  items: READINESS_ITEMS,
};

const PATCH = {
  agent: {
    support: {
      greeting_named: "Hi {{name}},",
      greeting: "Hi there,",
      fallback_escalation:
        "Because of the nature of your request, a member of our support team is personally reviewing it and will follow up with you shortly.",
      fallback_standard:
        "Our support team is looking into this and will get back to you as soon as possible.",
      fallback_reply:
        "{{greeting}}\n\nThank you for contacting Beautonomi support about \"{{subject}}\" (ticket {{ticketNumber}}).\n\n{{escalationLine}}\n\nIf you have any additional details or screenshots that could help, just reply to this ticket.\n\nWarm regards,\nBeautonomi Support",
      nudge:
        "Hi there,\n\nJust checking in on ticket {{ticketNumber}} — we replied {{daysSinceReply}} day(s) ago and want to make sure you saw it.\nIf our answer solved the problem, no action is needed. If you still need help, reply here and we'll pick it right back up.\n\nWarm regards,\nBeautonomi Support",
      csat_recovery:
        "{{greeting}}\n\nThank you for your honest feedback on ticket {{ticketNumber}}. I'm sorry the experience fell short.\nA senior member of our support team is personally reviewing what happened.\n\nWarm regards,\nBeautonomi Support",
    },
  },
  provider: {
    mobile: {
      components: {
        bookingCreateReadiness: READINESS_CORE,
      },
      screens: {
        reportUser: {
          title: "Report a user",
          breadcrumb: "Report user",
          intro:
            "Reports go to our trust & safety queue. Include who you're reporting and what happened. Urgent danger? Call emergency services first, then contact Partner support.",
          identifierLabel: "Who are you reporting?",
          identifierPlaceholder: "@handle or user ID",
          identifierHint:
            "Use the person's @handle from their profile, or their user ID if you have it from a booking or message thread.",
          descriptionLabel: "What happened?",
          descriptionPlaceholder: "Describe the incident, when it happened, and any relevant context…",
          submit: "Submit report",
          submittedTitle: "Report received",
          submittedBody:
            "Our trust & safety team will review your report. You may be contacted if we need more information.",
          submitFailedTitle: "Couldn't submit",
          submitFailedFallback: "Please try again or contact Partner support.",
          submitGenericError: "Something went wrong.",
          supportFallback: "Don't know their handle? Open a Partner support ticket instead",
        },
        inAppBrowser: {
          continueToSetupHub:
            "Your plan payment was confirmed. Continue to the setup hub to finish launching your business on Beautonomi.",
          goToSetupHub: "Go to setup hub",
        },
        contentSafety: {
          reportingHint:
            "To report a post, comment, or message, open it and choose Report from the menu (⋯). Reports go to our trust & safety team.",
          authPrompt: "Verify your identity to view and change content & safety settings.",
          authRequired: "Unlock settings",
          ageBandNote:
            "Some options are managed automatically for accounts aged 13–17 to help keep your experience age-appropriate.",
          lockedNote: "Settings marked as managed cannot be changed for your age group.",
          linkAgeSuitability: "Learn about age suitability & parental guidance",
        },
      },
    },
  },
  web: {
    provider: {
      bookings: {
        createReadiness: READINESS_CORE,
      },
    },
  },
};

function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target?.[k] && typeof target[k] === "object") {
      out[k] = deepMerge(target[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flatten(value, full)) out.set(k, v);
    } else {
      out.set(full, value);
    }
  }
  return out;
}

function unflatten(flat) {
  const root = {};
  for (const [pathKey, value] of flat) {
    const parts = pathKey.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

function setByPath(root, path, value) {
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function translateLeaf(enStr, locale) {
  if (typeof enStr !== "string" || !enStr.trim()) return enStr;
  const sa = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
  if (sa.includes(locale)) {
    const t = translateSa(enStr, locale);
    return t && t !== enStr ? t : enStr;
  }
  if (["fr", "ar", "sw"].includes(locale)) {
    const t = translateFrArSw(enStr, locale);
    return t && t !== enStr ? t : enStr;
  }
  const euMap = {
    de: translateFrArSw,
    es: translateFrArSw,
    pt: translateFrArSw,
    nl: translateFrArSw,
    it: translateFrArSw,
    id: translateFrArSw,
    hi: translateFrArSw,
    tr: translateFrArSw,
    rw: translateFrArSw,
    am: translateFrArSw,
  };
  const fn = euMap[locale];
  if (fn) {
    const t = fn(enStr, locale);
    return t && t !== enStr ? t : enStr;
  }
  return enStr;
}

const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
const mergedEn = deepMerge(en, PATCH);
fs.writeFileSync(enPath, JSON.stringify(mergedEn, null, 2) + "\n");
console.log("patched en.json");

const patchFlat = flatten(PATCH);
const enFlat = flatten(mergedEn);

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith(".json"))) {
  const code = file.replace(/\.json$/, "");
  if (code === "en" || OVERLAYS.has(code)) continue;
  const localePath = path.join(localesDir, file);
  const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));
  for (const [k] of patchFlat) {
    const enVal = enFlat.get(k);
    if (enVal == null) continue;
    if (typeof enVal === "object") continue;
    const translated = translateLeaf(String(enVal), code);
    setByPath(locale, k, translated);
  }
  fs.writeFileSync(localePath, JSON.stringify(locale, null, 2) + "\n");
  console.log("patched", code);
}

console.log("done");
