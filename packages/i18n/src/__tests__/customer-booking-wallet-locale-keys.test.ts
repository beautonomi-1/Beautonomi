import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES_DIR = path.join(__dirname, "../locales");
const SA_LOCALES = ["af", "zu", "xh", "st", "nso", "tn", "ts", "ve", "ss"];
const TARGET_LOCALES = [
  ...SA_LOCALES,
  "fr", "ar", "sw", "pt", "es", "de", "hi", "id", "tr", "am", "rw", "nl", "it",
];

const REQUIRED_KEYS = [
  "customer.mobile.components.groupBookingPayment.paid",
  "customer.mobile.components.groupBookingPayment.covered",
  "customer.mobile.screens.bookingDetail.paymentStatusPending",
  "customer.mobile.screens.bookingDetail.depositPaid",
  "customer.mobile.tabs.bookings.statusConfirmed",
  "customer.walletScreen.transactionDetailTitle",
  "customer.walletScreen.viewBooking",
];

function deepGet(obj: Record<string, unknown>, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((o, k) => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return (o as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

function hasWholeWordMinOrIm(value: string): boolean {
  return /\bmin\b|\bim\b/i.test(value);
}

describe("customer booking/wallet locale keys", () => {
  for (const locale of TARGET_LOCALES) {
    it(`${locale} has required keys`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
      for (const key of REQUIRED_KEYS) {
        const val = deepGet(raw, key);
        expect(typeof val).toBe("string");
        expect(String(val).length).toBeGreaterThan(0);
      }
    });
  }

  for (const locale of SA_LOCALES) {
    it(`${locale} wallet cardExpires is not English copy`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
      const val = String(deepGet(raw, "customer.walletScreen.cardExpires") ?? "");
      expect(val).not.toBe("Expires {{date}}");
    });

    it(`${locale} group paidOfTotal avoids English ' of '`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
      const val = String(deepGet(raw, "customer.mobile.screens.groupBookingDetail.paidOfTotal") ?? "");
      expect(val).not.toMatch(/ of /i);
    });

    it(`${locale} durationMinutes avoids bare min/im unit`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
      const val = String(deepGet(raw, "customer.mobile.screens.groupBookingDetail.durationMinutes") ?? "");
      expect(hasWholeWordMinOrIm(val)).toBe(false);
    });

    it(`${locale} paymentLoyaltyPts avoids bare pts`, () => {
      const raw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
      const val = String(deepGet(raw, "customer.mobile.screens.bookingDetail.paymentLoyaltyPts") ?? "");
      expect(/\bpts\b/i.test(val)).toBe(false);
    });
  }
});
