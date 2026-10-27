#!/usr/bin/env node
/**
 * Add customer booking / wallet / group-payment keys from en to target locales,
 * then apply hand-authored SA (and shared) string repairs for mixed-English leftovers.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const TARGET_LOCALES = [
  "af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss",
  "fr", "ar", "sw", "pt", "es", "de", "hi", "id", "tr", "am", "rw", "nl", "it",
];

const KEY_PATHS = [
  "customer.mobile.components.groupBookingPayment.paid",
  "customer.mobile.components.groupBookingPayment.partiallyPaid",
  "customer.mobile.components.groupBookingPayment.unpaid",
  "customer.mobile.components.groupBookingPayment.partial",
  "customer.mobile.components.groupBookingPayment.partiallyRefunded",
  "customer.mobile.components.groupBookingPayment.refunded",
  "customer.mobile.components.groupBookingPayment.notInvoiced",
  "customer.mobile.tabs.bookings.statusConfirmed",
  "customer.mobile.tabs.bookings.statusCompleted",
  "customer.mobile.tabs.bookings.statusCancelled",
  "customer.mobile.tabs.bookings.statusAwaitingCloseOut",
  "customer.mobile.screens.bookingDetail.paymentStatusPending",
  "customer.mobile.screens.bookingDetail.paymentStatusRefunded",
  "customer.mobile.screens.bookingDetail.paymentStatusPartiallyRefunded",
  "customer.mobile.screens.bookingDetail.paymentStatusUnpaid",
  "customer.mobile.screens.bookingDetail.paymentFailedLabel",
  "customer.mobile.screens.bookingDetail.payAtAppointment",
  "customer.mobile.screens.bookingDetail.depositPaid",
  "customer.mobile.screens.bookingDetail.statusPillConfirmed",
  "customer.mobile.screens.bookingDetail.statusPillCompleted",
  "customer.mobile.screens.bookingDetail.statusPillCancelled",
  "customer.mobile.screens.bookingDetail.statusPillWaiting",
  "customer.mobile.screens.bookingDetail.lifecycleUpdateTitle",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentPendingDescription",
  "customer.mobile.screens.bookingDetail.lifecycleAwaitingConfirmWithProvider",
  "customer.mobile.screens.bookingDetail.lifecycleConfirmedWithProvider",
  "customer.mobile.screens.bookingDetail.lifecycleCloseOutProvider",
  "customer.mobile.screens.bookingDetail.lifecycleCompletedDescription",
  "customer.mobile.screens.bookingDetail.lifecycleCancelledDescription",
  "customer.mobile.screens.bookingDetail.lifecycleNoShowDescription",
  "customer.mobile.screens.bookingDetail.lifecycleInProgressDescription",
  "customer.mobile.screens.bookingDetail.lifecycleBookingUpdateDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePayAtAppointmentDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentReceivedDescription",
  "customer.mobile.screens.bookingDetail.lifecycleDepositReceivedDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePartialPaymentDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePartialRefundDescription",
  "customer.mobile.screens.bookingDetail.lifecycleRefundedDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentFailedDescription",
  "customer.mobile.screens.bookingDetail.lifecyclePaymentNotConfirmedDescription",
  "customer.walletScreen.cardExpires",
  "customer.walletScreen.pendingGiftCardsWaiting_one",
  "customer.walletScreen.pendingGiftCardsWaiting_other",
  "customer.walletScreen.pendingGiftCardsEmailBody_one",
  "customer.walletScreen.pendingGiftCardsEmailBody_other",
  "customer.walletScreen.bankRefundHelpFallback",
  "customer.walletScreen.transactionCredit",
  "customer.walletScreen.transactionDebit",
  "customer.walletScreen.transactionDetailTitle",
  "customer.walletScreen.transactionDateLabel",
  "customer.walletScreen.transactionTypeLabel",
  "customer.walletScreen.transactionReferenceLabel",
  "customer.walletScreen.viewBooking",
  "customer.walletScreen.viewOrder",
  "customer.walletScreen.transactionRowA11y",
  "customer.walletScreen.refTypeBooking",
  "customer.walletScreen.refTypeBookingRefund",
  "customer.walletScreen.refTypeProductOrder",
  "customer.walletScreen.refTypeProductOrderRefund",
  "customer.walletScreen.refTypeWalletTopup",
  "customer.walletScreen.refTypeGiftCardRedemption",
  "customer.walletScreen.refTypeGiftCardRedeem",
  "customer.walletScreen.refTypeLoyaltyRedeem",
  "customer.walletScreen.refTypeReferral",
  "customer.walletScreen.refTypeMembership",
  "customer.walletScreen.refTypeCustomOffer",
  "customer.walletScreen.refTypeCustomOfferRefund",
  "customer.walletScreen.refTypeRefund",
  "customer.walletScreen.refTypeBankRefundHold",
  "customer.walletScreen.refTypeBankRefundRelease",
  "customer.walletScreen.refTypeBookingPaymentFailed",
];

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

/** locale -> dotted key -> value */
const REPAIRS = {
  af: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} minuut",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Betaal {{paid}} van {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Nog geen deelnemers gelys nie.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "By jou ligging",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Besprekingsbesonderhede nie beskikbaar nie",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Prys uiteensetting",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} min.",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} min.)",
    "customer.mobile.screens.bookingDetail.reportedAboutMinLate": "ongeveer {{minutes}} min. laat",
    "customer.mobile.components.groupBookingPayment.youPaidForGroup": "Jy het vir die groep betaal",
    "customer.mobile.components.groupBookingPayment.paidBy": "Betaal deur {{name}}",
    "customer.mobile.components.groupBookingPayment.partial": "Gedeeltelik",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Nog nie geskeduleer nie",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Lojaliteit ({{points}} punte)",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Gedeeltelik betaal",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Betaal by die afspraak",
    "customer.mobile.screens.bookingDetail.buzzerLabel": "Beltoon: {{value}}",
    "customer.mobile.screens.bookingDetail.calendarSectionSubtitleWeb":
      "Open Google kalender or Outlook in your blaaier, or deel a kalenderlêer (.ics) for Apple kalender and ander apps.",
  },
  zu: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} amaminithi",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Kukhokhelwe {{paid}} kwe-{{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Abahlanganyeli abakafakwanga okwamanje.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Endaweni yakho",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Imininingwane yokubhuka ayitholakali",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Ukuhlukaniswa kwentengo",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} amaminithi",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} amaminithi)",
    "customer.mobile.screens.bookingDetail.reportedAboutMinLate": "cishe amaminithi angu-{{minutes}} emuva",
    "customer.mobile.components.groupBookingPayment.youPaidForGroup": "Ukhokhele iqembu lonke",
    "customer.mobile.components.groupBookingPayment.paidBy": "Kukhokhelwe ngu-{{name}}",
    "customer.mobile.components.groupBookingPayment.partial": "Ingxenye",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Akukahlelwa",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Ubuthembeka (amaphoyinti angu-{{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Kukhokhelwe ingxenye",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Khokha ngesikhathi",
  },
  xh: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} imizuzu",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Kuhlawulwe {{paid}} kwe-{{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Akukabikho abahlanganyeli okwangoku.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Kwindawo yakho",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Iinkcukacha zokubhukisha azifumaneki",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Ukwahlula ixabiso",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} imizuzu",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} imizuzu)",
    "customer.mobile.screens.bookingDetail.reportedAboutMinLate": "malunga ne-{{minutes}} imizuzu emva",
    "customer.mobile.components.groupBookingPayment.partial": "Inxenye",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Akukahlelwanga",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Inyaniseko (amaphoyinti angu-{{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Kuhlawulwe inxenye",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Hlawula ngexesha",
  },
  ss: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} imizuzu",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Kukhokhelwe {{paid}} kwe-{{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Abahlanganyeli abakafakiwe okwamanje.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Endzaweni yakho",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Imininingwane yekubhuka ayitholakali",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Ukuhlukaniswa kwentengo",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} imizuzu",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} imizuzu)",
    "customer.mobile.components.groupBookingPayment.partial": "Ingxenye",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Akukahlelwe",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Kutsembeka (amaphoyinti angu-{{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Kukhokhelwe ingxenye",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Khokha ngesikhathi",
  },
  st: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} metsotso",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "E lefuoe {{paid}} ho {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Ha ho na bamokeli ba thathamisitsoeng hajoale.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Sebakeng sa hao",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Lintlha tsa ho buka ha li fumanehe",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Karolelano ea theko",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} metsotso",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} metsotso)",
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Ha e so hlophisoe",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Botšepehi (lipointe tse {{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "E lefuoë karolo",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Lefa kopanong",
  },
  nso: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} metsotso",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "E lefilwe {{paid}} go {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Ga go na bamokedi ba thathamisitsoeng gompieno.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Lefelong la gago",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Dintlha tša bukingo ga di gona",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Karolo ya theko",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} metsotso",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} metsotso)",
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Ga e sa hlophišwe",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Go iketla (di-point tše {{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "E lefilwe karolo",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Lefa kopanong",
  },
  tn: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} metsotso",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "E duetswe {{paid}} mo {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "Ga go na bamokedi ba thathamisitsoeng gompieno.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Lefelong la gago",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Dintlha tsa bukingo ga di teng",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Karolwana ya theko",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} metsotso",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} metsotso)",
    "customer.mobile.components.groupBookingPayment.partial": "Karolo",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "Ga e sa rulaganywe",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Go iketla (di-point tse {{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "E duetswe karolo",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Duela kopano",
  },
  ts: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} timinete",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Yi hakeleriwile {{paid}} ya {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "A ku na vahlanganyeri va tsariwaka sweswi.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Endhawini ya wena",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Vuxokoxoko bya ku buka a byi kumeki",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "Ku avanyisa ntsengo",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} timinete",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} timinete)",
    "customer.mobile.components.groupBookingPayment.partial": "Xiphemu",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "A swi nga hleliwanga",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Ku tshembeka (swiphemu swa {{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Yi hakeleriwile xiphemu",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Hakela hi nhlengelelo",
  },
  ve: {
    "customer.mobile.screens.groupBookingDetail.durationMinutes": "{{minutes}} metsotso",
    "customer.mobile.screens.groupBookingDetail.paidOfTotal": "Yo badelwa {{paid}} ha {{total}}",
    "customer.mobile.screens.groupBookingDetail.noParticipantsYet": "A hu na vhahlanganyeli vha tshe vha khou vha hone.",
    "customer.mobile.screens.groupBookingDetail.atYourLocation": "Fhethu hwawe",
    "customer.mobile.screens.groupBookingDetail.bookingDetailsUnavailable": "Zwidodombedzwa zwa u buka a zwi hone",
    "customer.mobile.screens.groupBookingDetail.priceBreakdown": "U avanyisa mutengo",
    "customer.mobile.screens.bookingDetail.durationMinShort": "{{minutes}} metsotso",
    "customer.mobile.screens.bookingDetail.calServiceLine": "{{name}} ({{minutes}} metsotso)",
    "customer.mobile.components.groupBookingPayment.partial": "Tshifhinganyana",
    "customer.mobile.screens.groupBookingDetail.notScheduled": "A si athu u hlela",
    "customer.mobile.screens.bookingDetail.paymentLoyaltyPts": "Vhuthembeki (zwiphemu zwa {{points}})",
    "customer.mobile.screens.bookingDetail.paymentPartiallyPaid": "Yo badelwa tshifhinganyana",
    "customer.mobile.screens.bookingDetail.payAtAppointment": "Bvela phanḓa nga tshifhinga",
  },
};

const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8"));

for (const locale of TARGET_LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  let added = 0;
  for (const keyPath of KEY_PATHS) {
    const enVal = deepGet(en, keyPath);
    if (typeof enVal !== "string") continue;
    const cur = deepGet(data, keyPath);
    if (cur == null || cur === "") {
      deepSet(data, keyPath, enVal);
      added++;
    }
  }
  const repairs = REPAIRS[locale] ?? {};
  for (const [keyPath, val] of Object.entries(repairs)) {
    deepSet(data, keyPath, val);
  }
  safeWriteJson(localePath, data);
  console.log(`${locale}: added ${added} keys, repairs ${Object.keys(repairs).length}`);
}
