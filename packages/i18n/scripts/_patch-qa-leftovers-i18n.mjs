import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const BASE = [
  "af",
  "am",
  "ar",
  "de",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "nl",
  "nso",
  "pt",
  "rw",
  "ss",
  "st",
  "sw",
  "tn",
  "tr",
  "ts",
  "ve",
  "xh",
  "zu",
];

const EN_ONLY_PATHS = {
  "provider.mobile.screens.bookingDetail.productHandoverBannerTitle":
    "{{count}} product orders still open",
  "provider.mobile.screens.bookingDetail.productHandoverBannerTitle_one":
    "1 product order still open",
  "provider.mobile.screens.bookingDetail.productHandoverBannerBody":
    "Hand over pickup items or finish delivery before you leave this screen.",
  "provider.mobile.screens.bookingDetail.productHandoverBannerA11y":
    "Open products section, {{count}} orders pending",
  "provider.mobile.screens.bookingDetail.productOrdersLinked":
    "{{count}} product orders linked to this visit",
  "provider.mobile.screens.bookingDetail.productPickupLabel": "Product pickup",
  "provider.mobile.screens.bookingDetail.productDeliveryLabel": "Product delivery",
  "provider.mobile.screens.bookingDetail.productFulfillmentUnknownLabel": "Product fulfillment",
  "provider.mobile.screens.bookingDetail.productQtyLine": "Qty {{count}}",
  "provider.mobile.screens.bookingDetail.appointmentPaymentLine": "Appointment payment: {{status}}",
  "provider.mobile.screens.bookingDetail.appointmentPaymentPaidNote": "— product payment is on this booking",
  "provider.mobile.screens.bookingDetail.setPickupFulfillment": "Set as pickup",
  "provider.mobile.screens.bookingDetail.setDeliveryFulfillment": "Set as delivery",
  "provider.mobile.screens.bookingDetail.manageInProductOrders": "Manage in product orders",
  "provider.mobile.screens.bookingDetail.couldNotUpdateFulfillment": "Could not update fulfillment",
  "provider.mobile.bookingNextStep.products.handOver.title": "Hand over products",
  "provider.mobile.bookingNextStep.products.handOver.body":
    "{{count}} product orders still need pickup or delivery.",
  "provider.mobile.bookingNextStep.products.handOver.body_one":
    "One product order still needs pickup or delivery.",
  "provider.mobile.bookingsList.closeOutStartedRetryComplete":
    "Started, but not completed. Tap Complete again.",
  "web.provider.bookings.detail.products.pickupLabel": "Product pickup",
  "web.provider.bookings.detail.products.deliveryLabel": "Product delivery",
  "web.provider.bookings.detail.products.unknownFulfillmentLabel": "Product fulfillment",
  "web.provider.bookings.detail.products.orderStatus": "Status: {{status}}",
  "web.provider.bookings.detail.products.paidOnAppointment": "Paid on this appointment",
  "web.provider.bookings.detail.products.markCollected": "Mark collected",
  "web.provider.bookings.detail.products.manageDelivery": "Manage delivery",
  "web.provider.bookings.detail.products.setPickup": "Set as pickup",
  "web.provider.bookings.detail.products.setDelivery": "Set as delivery",
  "web.provider.bookings.detail.products.openProductOrders": "Open product order",
  "web.provider.bookings.detail.products.collected": "Marked as collected",
  "web.provider.bookings.detail.products.collectFailed": "Could not mark collected",
  "web.provider.bookings.detail.products.fulfillmentTypeSaved": "Fulfillment type updated",
  "web.provider.bookings.detail.products.fulfillmentTypeFailed": "Could not update fulfillment type",
  "web.provider.bookings.detail.products.handoverBannerTitle":
    "{{count}} product orders still open",
  "web.provider.bookings.detail.products.handoverBannerTitle_one": "1 product order still open",
  "web.provider.bookings.detail.products.handoverBannerBody":
    "Hand over pickup items or finish delivery.",
  "web.provider.bookings.detail.productFulfillment.collected": "Marked as collected",
  "web.provider.bookings.detail.productFulfillment.collectFailed": "Could not mark collected",
  "web.provider.bookings.scheduleCard.closeOutDue": "Due",
  "web.provider.bookings.scheduleCard.actions.review_booking": "Review",
};

const AF = {
  "provider.mobile.screens.bookingDetail.productHandoverBannerTitle":
    "{{count}} produkbestellings nog oop",
  "provider.mobile.bookingsList.closeOutStartedRetryComplete":
    "Begint, maar nie voltooi nie. Tik Voltooi weer.",
  "web.provider.bookings.overview.appointmentsTile": "Afsprake",
  "web.provider.bookings.scheduleCard.actions.complete_service": "Voltooi diens",
};

function setPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] === undefined || cur[leaf] === null) {
    cur[leaf] = value;
  }
}

for (const loc of ["en", ...BASE]) {
  const file = path.join(localesDir, `${loc}.json`);
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [dotPath, enVal] of Object.entries(EN_ONLY_PATHS)) {
    const val = loc === "af" && AF[dotPath] ? AF[dotPath] : enVal;
    if (loc === "en" || curMissing(j, dotPath)) {
      setPath(j, dotPath, val);
    }
  }
  if (loc === "af") {
    for (const [dotPath, afVal] of Object.entries(AF)) {
      setPath(j, dotPath, afVal);
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
}

function curMissing(obj, dotPath) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || !(p in cur)) return true;
    cur = cur[p];
  }
  return false;
}

console.log("i18n patch done", BASE.length + 1, "locales");