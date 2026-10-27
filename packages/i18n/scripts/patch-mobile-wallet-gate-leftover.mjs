#!/usr/bin/env node
/** Short wallet + booking strings for mobile leftover gate (11 UI locales). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeWriteJson } from "./_safe-write-json.mjs";

const LOCALES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/locales");
const LOCALES = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss", "fr", "ar"];

const FIXES = {
  af: {
    "customer.walletScreen.transactionCredit": "Krediet",
    "customer.walletScreen.transactionDebit": "Debiet",
    "customer.walletScreen.transactionDateLabel": "Datum",
    "customer.walletScreen.transactionTypeLabel": "Tipe",
    "customer.walletScreen.refTypeRefund": "Terugbetaling",
    "customer.mobile.screens.bookingDetail.calendarSectionSubtitleWeb":
      "Open Google kalender or Outlook in your blaaier, or deel a kalenderlêer (.ics) for Apple kalender and ander apps.",
  },
  zu: {
    "customer.walletScreen.successTitle": "Impumelelo",
    "customer.walletScreen.transactionCredit": "Isikweletu",
    "customer.walletScreen.transactionDebit": "Isikweletu esiphuma",
    "customer.walletScreen.transactionDateLabel": "Usuku",
    "customer.walletScreen.transactionTypeLabel": "Uhlobo",
    "customer.walletScreen.refTypeRefund": "Ukubuyiselwa",
  },
  xh: {
    "customer.walletScreen.transactionCredit": "Isikredit",
    "customer.walletScreen.transactionDebit": "Isiboleko",
    "customer.walletScreen.transactionDateLabel": "Umhla",
    "customer.walletScreen.transactionTypeLabel": "Uhlobo",
    "customer.walletScreen.refTypeRefund": "Ukubuyiselwa",
  },
  st: {
    "customer.walletScreen.transactionCredit": "Krediti",
    "customer.walletScreen.transactionDebit": "Debiti",
    "customer.walletScreen.transactionDateLabel": "Letsatsi",
    "customer.walletScreen.transactionTypeLabel": "Mofuta",
    "customer.walletScreen.refTypeRefund": "Ho khutlisetsoa",
  },
  nso: {
    "customer.walletScreen.transactionCredit": "Krediti",
    "customer.walletScreen.transactionDebit": "Debiti",
    "customer.walletScreen.transactionDateLabel": "Letšatši",
    "customer.walletScreen.transactionTypeLabel": "Mohuta",
    "customer.walletScreen.refTypeRefund": "Go bušetšwa",
  },
  tn: {
    "customer.walletScreen.transactionCredit": "Krediti",
    "customer.walletScreen.transactionDebit": "Debiti",
    "customer.walletScreen.transactionDateLabel": "Letsatsi",
    "customer.walletScreen.transactionTypeLabel": "Mofuta",
    "customer.walletScreen.refTypeRefund": "Go busetswa",
  },
  ts: {
    "customer.walletScreen.transactionCredit": "Xikweleti",
    "customer.walletScreen.transactionDebit": "Ku herisiwa",
    "customer.walletScreen.transactionDateLabel": "Siku",
    "customer.walletScreen.transactionTypeLabel": "Muxaka",
    "customer.walletScreen.transactionReferenceLabel": "Xixaviso",
    "customer.walletScreen.refTypeRefund": "Ku tlheriseriwa",
  },
  ve: {
    "customer.walletScreen.transactionCredit": "Khiraditi",
    "customer.walletScreen.transactionDebit": "Debiti",
    "customer.walletScreen.transactionDateLabel": "Datumu",
    "customer.walletScreen.transactionTypeLabel": "Lushaka",
    "customer.walletScreen.transactionReferenceLabel": "Tshivhilo",
    "customer.walletScreen.refTypeRefund": "U vhuyelwa",
  },
  ss: {
    "customer.walletScreen.transactionCredit": "Isikweleti",
    "customer.walletScreen.transactionDebit": "Isikweleti esiphuma",
    "customer.walletScreen.transactionDateLabel": "Lilanga",
    "customer.walletScreen.transactionTypeLabel": "Luhlobo",
    "customer.walletScreen.transactionReferenceLabel": "Sibonelo",
    "customer.walletScreen.refTypeRefund": "Kubuyiselwa",
  },
  fr: {
    "customer.walletScreen.topUpSuccessBody": "Votre portefeuille a été rechargé.",
    "customer.walletScreen.transactionCredit": "Crédit",
    "customer.walletScreen.transactionDebit": "Débit",
    "customer.walletScreen.refTypeRefund": "Remboursement",
  },
  ar: {
    "customer.walletScreen.topUpSuccessBody": "تم شحن محفظتك.",
    "customer.walletScreen.transactionCredit": "إيداع",
    "customer.walletScreen.transactionDebit": "سحب",
    "customer.walletScreen.transactionDateLabel": "التاريخ",
    "customer.walletScreen.transactionTypeLabel": "النوع",
    "customer.walletScreen.refTypeRefund": "استرداد",
  },
};

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

for (const locale of LOCALES) {
  const fixes = FIXES[locale];
  if (!fixes) continue;
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(localePath, "utf8"));
  for (const [keyPath, val] of Object.entries(fixes)) {
    deepSet(data, keyPath, val);
  }
  safeWriteJson(localePath, data);
  console.log(`${locale}: ${Object.keys(fixes).length} gate fixes`);
}
