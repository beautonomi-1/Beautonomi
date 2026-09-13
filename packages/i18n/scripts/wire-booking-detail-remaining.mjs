#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(
  __dirname,
  "../../../apps/web/src/app/provider/bookings/[id]/page.tsx",
);
let s = fs.readFileSync(filePath, "utf8");

const pairs = [
  ['toast.error("There is no remaining balance on this booking.");', 'toast.error(t("web.provider.bookings.detail.toast.noBalance"));'],
  [': "Could not prepare card payment.");', ': t("web.provider.bookings.detail.toast.cardPaymentFailed"));'],
  [
    '"The terminal payment succeeded but the sale could not be finalized. Check Sales for a pending entry."',
    't("web.provider.bookings.detail.toast.terminalFinalizeFailed")',
  ],
  [
    ': "The sale was saved, but updating the booking failed."',
    ': t("web.provider.bookings.detail.toast.saleSavedBookingFailed")',
  ],
  [': "Failed to update ETA");', ': t("web.provider.bookings.detail.toast.etaFailed"));'],
  [
    '"Customer can\'t verify — briefly describe why (required for audit):"',
    't("web.provider.bookings.detail.toast.overridePrompt")',
  ],
  ['toast.success("Arrival verified manually. You can start the service.");', 'toast.success(t("web.provider.bookings.detail.toast.overrideSuccess"));'],
  [': "Failed to override verification");', ': t("web.provider.bookings.detail.toast.overrideFailed"));'],
  ['? "Confirmation re-sent to customer."', '? t("web.provider.bookings.detail.toast.confirmationResent")'],
  [': "Reminder sent to customer."', ': t("web.provider.bookings.detail.toast.reminderSentCustomer")'],
  ['r.error || "Notification could not be sent."', 'r.error || t("web.provider.bookings.detail.toast.notificationFailed")'],
  [': "Failed to send notification"', ': t("web.provider.bookings.detail.toast.notificationSendFailed")'],
  ['toast.success("Cancellation notice sent to customer.");', 'toast.success(t("web.provider.bookings.detail.toast.cancellationNoticeSent"));'],
  ['r.error || "Cancellation notice could not be sent."', 'r.error || t("web.provider.bookings.detail.toast.cancellationNoticeFailed")'],
  [': "Failed to send cancellation notice"', ': t("web.provider.bookings.detail.toast.cancellationNoticeSendFailed")'],
  [': "Failed to verify QR");', ': t("web.provider.bookings.detail.toast.verifyQrFailed"));'],
  [
    '"Enter the 8-character code from the customer\u2019s QR, paste the full scanned JSON, or use Scan with camera."',
    't("web.provider.bookings.detail.toast.verifyQrHint")',
  ],
  ['loadingMessage="Loading booking details..."', 'loadingMessage={t("web.provider.bookings.detail.loading")}'],
  ['title="Booking not found"', 'title={t("web.provider.bookings.detail.notFoundTitle")}'],
  ['label: "Go Back"', 'label: t("web.provider.bookings.detail.goBack")'],
  ['← Back to Bookings', '{t("web.provider.bookings.detail.backToBookings")}'],
  ['View Receipt PDF', '{t("web.provider.bookings.detail.viewReceiptPdf")}'],
  ['? `Booking #${booking.booking_number}` : "Booking"', '? t("web.provider.bookings.detail.bookingNumber", { number: booking.booking_number }) : t("web.provider.bookings.detail.bookingTitle")'],
  ['Walk-in', '{t("web.provider.bookings.detail.badges.walkIn")}'],
  ['Group', '{t("web.provider.bookings.detail.badges.group")}'],
  ['Custom offer', '{t("web.provider.bookings.detail.badges.customOffer")}'],
  ['Found you via ', '{t("web.provider.bookings.detail.badges.foundVia", { source: '],
];

for (const [from, to] of pairs) {
  if (s.includes(from)) s = s.replaceAll(from, to);
  else console.warn("missing:", from.slice(0, 50));
}

fs.writeFileSync(filePath, s);
console.log("booking detail remaining strings patched");
