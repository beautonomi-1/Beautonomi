#!/usr/bin/env node
/**
 * Wires provider settings sub-pages with useTranslation and web.provider.settings.* keys.
 * Run: node packages/i18n/scripts/wire-provider-settings-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const settingsRoot = path.join(root, "apps/web/src/app/provider/settings");
const localesDir = path.join(__dirname, "../src/locales");
const extractPath = path.join(__dirname, "../settings-strings-extract.json");

const COMMON_KEYS = {
  Home: "web.provider.common.breadcrumbHome",
  Provider: "web.provider.common.breadcrumbProvider",
  Settings: "web.provider.common.breadcrumbSettings",
  Retry: "web.provider.common.retry",
  "Loading...": "common.loading",
  "Saving...": "web.provider.settings.common.saving",
  "Save Changes": "web.provider.settings.common.saveChanges",
};

/** Maps page path → [categoryKey, itemKey] for title/subtitle from categories.items */
const PAGE_META = {
  "addons/page.tsx": ["services", "addons"],
  "ads/page.tsx": ["marketingIntegrations", "paidAds"],
  "ai/page.tsx": ["marketingIntegrations", "aiStudio"],
  "appointment-activity/blocked-time/page.tsx": ["appointmentActivity", "blockedTime"],
  "appointment-activity/business-details/page.tsx": ["appointmentActivity", "businessDetails"],
  "appointment-activity/closed-periods/page.tsx": ["appointmentActivity", "closedPeriods"],
  "appointment-activity/group-appointments/page.tsx": ["appointmentActivity", "groupAppointments"],
  "appointment-activity/online-booking/page.tsx": ["appointmentActivity", "onlineBooking"],
  "appointment-activity/resources/page.tsx": ["appointmentActivity", "resources"],
  "appointment-activity/waitlist/page.tsx": ["appointmentActivity", "waitlist"],
  "billing/page.tsx": ["appointmentActivity", "billing"],
  "business-description/page.tsx": ["appointmentActivity", "businessDescription"],
  "calendar-integration/page.tsx": ["appointmentActivity", "calendarIntegration"],
  "calendar/colors-icons/page.tsx": ["appointmentActivity", "calendarColors"],
  "calendar/display-preferences/page.tsx": ["appointmentActivity", "calendarDisplay"],
  "calendar/links/page.tsx": ["appointmentActivity", "calendarLinks"],
  "cancellation-policies/page.tsx": ["clients", "cancellationPolicies"],
  "clients/cancellation-reasons/page.tsx": ["clients", "cancellationReasons"],
  "clients/list/page.tsx": ["clients", "clientList"],
  "clients/referrals/page.tsx": ["clients", "referrals"],
  "customer-visibility/page.tsx": ["clients", "customerVisibility"],
  "distance/page.tsx": ["appointmentActivity", "distance"],
  "gallery/page.tsx": ["appointmentActivity", "gallery"],
  "integrations/email/page.tsx": ["marketingIntegrations", "emailIntegration"],
  "integrations/twilio/page.tsx": ["marketingIntegrations", "twilioIntegration"],
  "locations/page.tsx": ["appointmentActivity", "locations"],
  "marketing-integrations/page.tsx": ["marketingIntegrations", null],
  "note-templates/page.tsx": ["appointmentActivity", "noteTemplates"],
  "notifications/page.tsx": ["account", "notifications"],
  "operating-hours/page.tsx": ["appointmentActivity", "operatingHours"],
  "payments/page.tsx": ["sales", "paymentMethods"],
  "payout-accounts/page.tsx": ["sales", "payoutAccounts"],
  "sales/card-machines/page.tsx": ["sales", "cardMachines"],
  "sales/gift-cards/page.tsx": ["sales", "giftCards"],
  "sales/paystack-terminal/page.tsx": ["sales", "paystackTerminal"],
  "sales/receipt-sequencing/page.tsx": ["sales", "receiptSequencing"],
  "sales/receipt-template/page.tsx": ["sales", "receiptTemplate"],
  "sales/taxes/page.tsx": ["sales", "taxes"],
  "sales/terminal-integrations/page.tsx": ["sales", "terminalIntegrations"],
  "sales/terminal-shop/page.tsx": ["sales", "terminalShop"],
  "sales/tips/page.tsx": ["sales", "tips"],
  "sales/travel-fees/page.tsx": ["sales", "travelFees"],
  "sales/upselling/page.tsx": ["sales", "upselling"],
  "sales/yoco-devices/page.tsx": ["sales", "yocoIntegration"],
  "sales/yoco-integration/page.tsx": ["sales", "yocoIntegration"],
  "service-zones/page.tsx": ["appointmentActivity", "serviceZones"],
  "services/memberships/page.tsx": ["services", "memberships"],
  "services/menu/page.tsx": ["services", "servicesMenu"],
  "team/commissions/page.tsx": ["team", "commissions"],
  "team/notifications/page.tsx": ["team", "teamNotifications"],
  "team/permissions/page.tsx": ["team", "permissions"],
  "team/roles/page.tsx": ["team", "roles"],
  "team/time-off-types/page.tsx": ["team", "timeOffTypes"],
  "tips/distribution/page.tsx": ["sales", "tipsDistribution"],
  "upgrade-to-salon/page.tsx": ["appointmentActivity", "upgradeToSalon"],
  "verification/page.tsx": ["appointmentActivity", "verification"],
};

const SKIP_PAGES = new Set(["page.tsx", "yoco-terminals/page.tsx"]);

function pageSlug(rel) {
  return rel.replace(/\/page\.tsx$/, "").replace(/\[vendor\]/g, "vendor");
}

function toKey(str, used) {
  let base = str
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

function categoryTitleKey(category, item) {
  if (!item) return `web.provider.settings.categories.${category}.title`;
  return `web.provider.settings.categories.${category}.items.${item}.title`;
}

function categorySubtitleKey(category, item) {
  if (!item) return `web.provider.settings.categories.${category}.description`;
  return `web.provider.settings.categories.${category}.items.${item}.description`;
}

function injectHook(source) {
  if (source.includes("useTranslation")) return source;
  const importLine = 'import { useTranslation } from "@beautonomi/i18n";';
  if (source.includes('"use client"')) {
    source = source.replace(/"use client";\s*\n/, `"use client";\n\n${importLine}\n`);
  } else {
    source = `${importLine}\n${source}`;
  }
  const fnMatch = source.match(
    /export default function (\w+)\([^)]*\)\s*\{/,
  );
  if (fnMatch) {
    source = source.replace(
      fnMatch[0],
      `${fnMatch[0]}\n  const { t } = useTranslation();`,
    );
  }
  return source;
}

function replaceLiteral(source, from, toKeyPath) {
  if (!from || from.includes("${") || from.includes("t(")) return source;
  const patterns = [
    [`title="${from}"`, `title={t("${toKeyPath}")}`],
    [`subtitle="${from}"`, `subtitle={t("${toKeyPath}")}`],
    [`description="${from}"`, `description={t("${toKeyPath}")}`],
    [`loadingMessage="${from}"`, `loadingMessage={t("${toKeyPath}")}`],
    [`placeholder="${from}"`, `placeholder={t("${toKeyPath}")}`],
    [`{ label: "${from}" }`, `{ label: t("${toKeyPath}") }`],
    [`{ label: "${from}",`, `{ label: t("${toKeyPath}"),`],
    [`toast.success("${from}")`, `toast.success(t("${toKeyPath}"))`],
    [`toast.error("${from}")`, `toast.error(t("${toKeyPath}"))`],
    [`title: "${from}"`, `title: t("${toKeyPath}")`],
    [`label="${from}"`, `label={t("${toKeyPath}")}`],
    [`editLabel="${from}"`, `editLabel={t("${toKeyPath}")}`],
    [`action={{ label: "${from}"`, `action={{ label: t("${toKeyPath}")`],
    [`> ${from}</`, `>{t("${toKeyPath}")}</`],
    [`>${from}<`, `>{t("${toKeyPath}")}<`],
  ];
  for (const [a, b] of patterns) {
    source = source.split(a).join(b);
  }
  return source;
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

const extracted = JSON.parse(fs.readFileSync(extractPath, "utf8"));
const pagesLocale = {};
const wired = [];
const skipped = [];

/** Extra strings not captured by extract */
const EXTRA = {
  "appointments/page.tsx": {
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
  },
  "services/menu/page.tsx": {
    body: "Your services, categories, and pricing are managed from the catalogue. Use the button below to add, edit, or reorder your service menu.",
    manageCatalogue: "Manage Services in Catalogue",
  },
  "payments/page.tsx": {
    loadFailed: "Failed to load payment settings",
    enableAtLeastOne: "Enable at least one payment method",
    updated: "Payment methods updated",
    saveFailed: "Failed to save payment settings",
    yocoBanner:
      "In-person card payments are processed through your Yoco terminal.",
    manageYoco: "Manage Yoco terminals",
    cash: "Cash",
    cashDesc: "Accept cash at your business location.",
    yocoCard: "In-person Card (Yoco Terminal)",
    yocoCardDesc: "Accept in-person card payments via Yoco terminal.",
    online: "Online Payments",
    onlineDesc: "Accept online checkout payments.",
    paystackTerminal: "Paystack Terminal (in-person QR / link)",
    paystackTerminalDesc:
      "Let customers pay in person by scanning your Paystack Terminal QR or link. Payments arrive in your terminal inbox to allocate.",
    noActiveTerminal: "No active terminal yet. Request setup from",
    paystackTerminalSettings: "Paystack Terminal settings",
    noActiveTerminalSuffix: "so it becomes selectable at checkout.",
    giftCards: "Gift Cards",
    giftCardsDesc:
      "Allow customers to redeem platform gift cards at your business.",
    subtitle: "Choose how customers can pay your business",
  },
  "notifications/page.tsx": {
    requestTimeout: "Request timed out. Please try again.",
    loadFailed: "Failed to load notification preferences",
    updated: "Notification preferences updated",
    updateFailed: "Failed to update preferences",
    alertSoundEnabled: "Booking alert sound enabled",
    alertSoundDisabled: "Booking alert sound disabled",
    alertSoundUpdateFailed: "Failed to update booking alert preference",
    unsubscribedMarketing: "Unsubscribed from marketing",
    subscribedMarketing: "Subscribed to marketing",
    marketingUpdateFailed: "Failed to update marketing preferences",
    bookingAlertSound: "Booking alert sound",
    bookingAlertSoundDesc:
      "Play a short tone in this browser when a new booking arrives, if your market configures a normal-booking ringtone in Control Plane.",
    marketingComms: "Marketing Communications",
    marketingCommsDesc: "Unsubscribe from marketing emails and promotional offers",
    email: "Email",
    sms: "SMS",
    whatsapp: "WhatsApp",
    push: "Push Notifications",
    sections: {
      booking_updates: {
        title: "Booking Updates",
        description:
          "Get notified when bookings are created, updated, or rescheduled",
      },
      booking_cancellations: {
        title: "Booking Cancellations",
        description: "Be notified when clients cancel their appointments",
      },
      booking_reminders: {
        title: "Booking Reminders",
        description: "Receive reminders about upcoming appointments",
      },
      new_reviews: {
        title: "New Reviews",
        description: "Get notified when customers leave reviews",
      },
      review_responses: {
        title: "Review Responses",
        description: "Notifications about review interactions",
      },
      client_messages: {
        title: "Client Messages",
        description: "Stay updated on messages from clients",
      },
      payment_received: {
        title: "Payment Received",
        description: "Get notified when payments are received",
      },
      payout_updates: {
        title: "Payout Updates",
        description: "Updates on payout requests and processing",
      },
      waitlist_notifications: {
        title: "Waitlist Notifications",
        description: "Get notified about waitlist activity",
      },
      system_updates: {
        title: "System Updates",
        description: "Important system announcements and updates",
      },
      marketing: {
        title: "Marketing & Promotions",
        description: "Receive marketing emails and promotional offers",
      },
    },
  },
};

function flattenExtra(obj) {
  const out = [];
  for (const v of Object.values(obj)) {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") out.push(...flattenExtra(v));
  }
  return out;
}

for (const rel of new Set([...Object.keys(extracted), ...Object.keys(EXTRA)])) {
  if (SKIP_PAGES.has(rel)) continue;
  const fullPath = path.join(settingsRoot, rel);
  if (!fs.existsSync(fullPath)) {
    skipped.push({ rel, reason: "file not found" });
    continue;
  }
  let source = fs.readFileSync(fullPath, "utf8");
  if (source.includes("redirect(")) {
    skipped.push({ rel, reason: "redirect-only" });
    continue;
  }

  const slug = pageSlug(rel);
  const usedKeys = new Set();
  const pageKeys = {};
  const meta = PAGE_META[rel];

  source = injectHook(source);

  const allStrings = [...(extracted[rel] || []), ...flattenExtra(EXTRA[rel] || {})];

  for (const str of allStrings) {
    if (!str || str.length < 2) continue;
    if (COMMON_KEYS[str]) {
      source = replaceLiteral(source, str, COMMON_KEYS[str]);
      continue;
    }
    if (meta) {
      const [cat, item] = meta;
      if (str === extracted[rel]?.[0] || (EXTRA[rel] && Object.values(EXTRA[rel])[0] === str)) {
        // title handled below
      }
    }
    const lk = toKey(str, usedKeys);
    pageKeys[lk] = str;
    source = replaceLiteral(source, str, `web.provider.settings.pages.${slug}.${lk}`);
  }

  if (meta) {
    const [cat, item] = meta;
    source = source.replace(
      /title=\{t\("web\.provider\.settings\.pages\.[^"]+\.[^"]+"\)\}/,
      `title={t("${categoryTitleKey(cat, item)}")}`,
    );
    source = source.replace(
      /subtitle=\{t\("web\.provider\.settings\.pages\.[^"]+\.[^"]+"\)\}/,
      `subtitle={t("${categorySubtitleKey(cat, item)}")}`,
    );
  }

  // save label pattern
  source = source.replace(
    /saveLabel=\{isSaving \? "Saving\.\.\." : "Save Changes"\}/g,
    'saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}',
  );
  source = source.replace(
    /saveLabel=\{isSaving \? t\("[^"]+"\) : "Save Changes"\}/g,
    'saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}',
  );

  if (Object.keys(pageKeys).length) {
    pagesLocale[slug] = { ...(pagesLocale[slug] || {}), ...pageKeys };
  }

  // notifications: wire section config
  if (rel === "notifications/page.tsx") {
    source = source.replace(
      /const notificationSections = \[[\s\S]*?\];/,
      `const notificationSections = [
  { id: "booking_updates", titleKey: "booking_updates", icon: Calendar },
  { id: "booking_cancellations", titleKey: "booking_cancellations", icon: AlertCircle },
  { id: "booking_reminders", titleKey: "booking_reminders", icon: Clock },
  { id: "new_reviews", titleKey: "new_reviews", icon: Star },
  { id: "review_responses", titleKey: "review_responses", icon: MessageSquare },
  { id: "client_messages", titleKey: "client_messages", icon: MessageSquare },
  { id: "payment_received", titleKey: "payment_received", icon: DollarSign },
  { id: "payout_updates", titleKey: "payout_updates", icon: Wallet },
  { id: "waitlist_notifications", titleKey: "waitlist_notifications", icon: Users },
  { id: "system_updates", titleKey: "system_updates", icon: FileText },
  { id: "marketing", titleKey: "marketing", icon: TrendingUp },
];`,
    );
    source = source.replace(
      /<h3 className="text-lg font-semibold mb-1">\{section\.title\}<\/h3>/,
      `<h3 className="text-lg font-semibold mb-1">{t(\`web.provider.settings.pages.notifications.sections.\${section.titleKey}.title\`)}</h3>`,
    );
    source = source.replace(
      /<p className="text-sm text-gray-600">\{section\.description\}<\/p>/,
      `<p className="text-sm text-gray-600">{t(\`web.provider.settings.pages.notifications.sections.\${section.titleKey}.description\`)}</p>`,
    );
  }

  fs.writeFileSync(fullPath, source);
  wired.push(rel);
}

// Merge locales into en.json
const enPath = path.join(localesDir, "en.json");
const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
en.web = en.web || {};
en.web.provider = en.web.provider || {};
en.web.provider.settings = en.web.provider.settings || {};
en.web.provider.settings.common = {
  saveChanges: "Save Changes",
  saving: "Saving...",
  loading: "Loading...",
  loadFailed: "Failed to load settings",
  ...en.web.provider.settings.common,
};
en.web.provider.settings.appointments = {
  ...en.web.provider.settings.appointments,
  ...EXTRA["appointments/page.tsx"],
  retry: "Retry",
};
en.web.provider.settings.pages = deepMerge(en.web.provider.settings.pages || {}, pagesLocale);

// Flatten EXTRA into pages locale
for (const [rel, obj] of Object.entries(EXTRA)) {
  const slug = pageSlug(rel);
  en.web.provider.settings.pages[slug] = {
    ...(en.web.provider.settings.pages[slug] || {}),
    ...obj,
  };
}

fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);

console.log(`Wired ${wired.length} pages`);
console.log(`Skipped ${skipped.length}:`, skipped);
console.log(`Added ${Object.keys(pagesLocale).length} page locale groups`);
