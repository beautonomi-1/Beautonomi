#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const settingsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/src/app/provider/settings",
);

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, a);
    else if (e.name === "page.tsx") a.push(p);
  }
  return a;
}

const GLOBAL = [
  ['? "Request timed out. Please try again."', '? t("web.provider.common.requestTimeout")'],
  ['label: "Retry"', 'label: t("web.provider.common.retry")'],
  ['loadingMessage="Loading..."', 'loadingMessage={t("common.loading")}'],
  ['>Loading...</div>', '>{t("common.loading")}</div>'],
  ['<div className="py-8 text-center text-sm text-gray-500">Loading...</div>', '<div className="py-8 text-center text-sm text-gray-500">{t("common.loading")}</div>'],
];

const APPOINTMENTS = [
  ['title={t("web.provider.settings.pages.appointments.appointmentSettings")}', 'title={t("web.provider.settings.appointments.pageTitle")}'],
  ['subtitle={t("web.provider.settings.pages.appointments.configureDefaultAppointmentStatusAndConfirmation")}', 'subtitle={t("web.provider.settings.appointments.pageSubtitle")}'],
  ['title={t("web.provider.settings.pages.appointments.failedToLoadSettings")}', 'title={t("web.provider.settings.appointments.loadFailedTitle")}'],
  ['Default Appointment Status', '{t("web.provider.settings.appointments.defaultAppointmentStatus")}'],
  ['Choose the default status for new appointments when they are created', '{t("web.provider.settings.appointments.defaultAppointmentStatusHint")}'],
  ['New appointments will be created with this status unless specified otherwise', '{t("web.provider.settings.appointments.defaultStatusFootnote")}'],
  ['Auto-Confirm Appointments', '{t("web.provider.settings.appointments.autoConfirm")}'],
  ['Automatically confirm appointments when they are created (if default status is "Pending")', '{t("web.provider.settings.appointments.autoConfirmHint")}'],
  ['Require Confirmation', '{t("web.provider.settings.appointments.requireConfirmation")}'],
  ['Require manual confirmation before appointments are marked as "Booked"', '{t("web.provider.settings.appointments.requireConfirmationHint")}'],
  ['Applies to customer online booking requests only. Walk-ins and appointments you\n                  create in the provider portal are confirmed immediately.', '{t("web.provider.settings.appointments.requireConfirmationFootnote")}'],
  ['{t("web.provider.settings.pages.appointments.bookingLifecycleTiming")}', '{t("web.provider.settings.appointments.lifecycleTitle")}'],
  ['Control how long customers wait for confirmation and when open appointments move into\n                close-out.', '{t("web.provider.settings.appointments.lifecycleHint")}'],
  ['{t("web.provider.settings.pages.appointments.confirmationSlaHours")}', '{t("web.provider.settings.appointments.confirmationSla")}'],
  ['Target time to respond to new online requests during business hours.', '{t("web.provider.settings.appointments.confirmationSlaHint")}'],
  ['{t("web.provider.settings.pages.appointments.releaseUnconfirmedHoursBeforeSlot")}', '{t("web.provider.settings.appointments.releaseUnconfirmed")}'],
  ['Pending online requests expire this many hours before the appointment time.', '{t("web.provider.settings.appointments.releaseUnconfirmedHint")}'],
  ['{t("web.provider.settings.pages.appointments.closeOutGraceSalonMinutes")}', '{t("web.provider.settings.appointments.closeoutGraceSalon")}'],
  ['{t("web.provider.settings.pages.appointments.closeOutGraceAtHomeMinutes")}', '{t("web.provider.settings.appointments.closeoutGraceAtHome")}'],
  ['{t("web.provider.settings.pages.appointments.lateArrivalGraceMinutes")}', '{t("web.provider.settings.appointments.lateArrivalGrace")}'],
  ['Extra minutes after the scheduled start before a salon client is treated as late.', '{t("web.provider.settings.appointments.lateArrivalGraceHint")}'],
  ['Accept custom service requests', '{t("web.provider.settings.appointments.acceptCustomRequests")}'],
  ['When off, customers see that you are not accepting custom requests from the app or web profile.', '{t("web.provider.settings.appointments.acceptCustomRequestsHint")}'],
  ['These settings apply to all new appointments created through the provider portal.\n              Existing appointments are not affected.', '{t("web.provider.settings.appointments.infoAlert")}'],
  ['Last updated: {new Date(localSettings.updatedAt).toLocaleString()}', '{t("web.provider.settings.appointments.lastUpdated", { date: new Date(localSettings.updatedAt).toLocaleString() })}'],
];

const SERVICES_MENU = [
  ['{ label: t("web.provider.settings.pages.services/menu.servicesMenu") }', '{ label: t("web.provider.settings.categories.services.items.servicesMenu.title") }'],
  ['Your services, categories, and pricing are managed from the catalogue.\n          Use the button below to add, edit, or reorder your service menu.', '{t("web.provider.settings.pages.services/menu.body")}'],
  ['Manage Services in Catalogue', '{t("web.provider.settings.pages.services/menu.manageCatalogue")}'],
];

let n = 0;
for (const file of walk(settingsRoot)) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("useTranslation")) continue;
  const rel = path.relative(settingsRoot, file).replace(/\\/g, "/");
  for (const [a, b] of GLOBAL) s = s.split(a).join(b);
  if (rel === "appointments/page.tsx") {
    for (const [a, b] of APPOINTMENTS) s = s.split(a).join(b);
  }
  if (rel === "services/menu/page.tsx") {
    for (const [a, b] of SERVICES_MENU) s = s.split(a).join(b);
  }
  fs.writeFileSync(file, s);
  n++;
}
console.log(`Pass2 fixed ${n} files`);
