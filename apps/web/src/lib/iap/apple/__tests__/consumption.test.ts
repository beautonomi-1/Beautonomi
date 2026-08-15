import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fx/get-fx-rate", () => ({
  getFxRate: vi.fn(async ({ base, quote }: { base: string; quote: string }) => {
    if (base === quote) return 1;
    if (base === "ZAR" && quote === "USD") return 0.05;
    return null;
  }),
}));

import {
  ACCOUNT_TENURE,
  CONSUMPTION_STATUS,
  LIFETIME_DOLLARS,
  REFUND_PREFERENCE,
  adsPackConsumption,
  appleAccountTenureBucket,
  appleAppAccountTokenOrOmit,
  appleLifetimeDollarsBucket,
  appleStoredAmountsToUsd,
  subscriptionPeriodConsumption,
  undeclaredAppleConsumption,
} from "../consumption";

describe("appleAccountTenureBucket", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("maps live account age into Apple tenure buckets instead of undeclared", () => {
    expect(appleAccountTenureBucket(new Date("2026-08-14T12:00:00.000Z"), now)).toBe(
      ACCOUNT_TENURE.ZERO_TO_THREE_DAYS,
    );
    expect(appleAccountTenureBucket(new Date("2026-07-01T12:00:00.000Z"), now)).toBe(
      ACCOUNT_TENURE.THIRTY_TO_NINETY_DAYS,
    );
    expect(appleAccountTenureBucket(new Date("2025-01-01T12:00:00.000Z"), now)).toBe(
      ACCOUNT_TENURE.OVER_YEAR,
    );
  });
});

describe("appleLifetimeDollarsBucket", () => {
  it("uses Apple USD buckets, including an explicit zero", () => {
    expect(appleLifetimeDollarsBucket(0)).toBe(LIFETIME_DOLLARS.ZERO);
    expect(appleLifetimeDollarsBucket(12)).toBe(LIFETIME_DOLLARS.UP_TO_50);
    expect(appleLifetimeDollarsBucket(2500)).toBe(LIFETIME_DOLLARS.OVER_2000);
  });
});

describe("adsPackConsumption", () => {
  it("prefers a grant when the ads pack has not been spent", () => {
    expect(adsPackConsumption(0, 500)).toEqual({
      consumptionStatus: CONSUMPTION_STATUS.NOT_CONSUMED,
      deliveryStatus: 0,
      refundPreference: REFUND_PREFERENCE.GRANT,
    });
  });

  it("prefers a decline once most of the ads pack has been delivered", () => {
    expect(adsPackConsumption(480, 500).refundPreference).toBe(REFUND_PREFERENCE.DECLINE);
    expect(adsPackConsumption(480, 500).consumptionStatus).toBe(CONSUMPTION_STATUS.FULLY_CONSUMED);
  });
});

describe("subscriptionPeriodConsumption", () => {
  it("prefers a grant at the start of the paid period", () => {
    const purchase = new Date("2026-08-14T12:00:00.000Z");
    const expires = new Date("2026-09-14T12:00:00.000Z");
    const now = new Date("2026-08-14T18:00:00.000Z");
    expect(subscriptionPeriodConsumption(purchase, expires, now).refundPreference).toBe(
      REFUND_PREFERENCE.GRANT,
    );
  });

  it("prefers a decline after most of the period has elapsed", () => {
    const purchase = new Date("2026-07-15T12:00:00.000Z");
    const expires = new Date("2026-08-15T12:00:00.000Z");
    const now = new Date("2026-08-14T12:00:00.000Z");
    expect(subscriptionPeriodConsumption(purchase, expires, now).refundPreference).toBe(
      REFUND_PREFERENCE.DECLINE,
    );
    expect(subscriptionPeriodConsumption(purchase, expires, now).consumptionStatus).toBe(
      CONSUMPTION_STATUS.FULLY_CONSUMED,
    );
  });
});

describe("appleAppAccountTokenOrOmit", () => {
  it("omits non-UUID tokens so Apple does not reject the consumption PUT", () => {
    expect(appleAppAccountTokenOrOmit("not-a-uuid")).toBeUndefined();
    expect(appleAppAccountTokenOrOmit("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("undeclaredAppleConsumption", () => {
  it("still answers Apple instead of staying silent", () => {
    const body = undeclaredAppleConsumption();
    expect(body.customerConsented).toBe(true);
    expect(body.accountTenure).toBe(ACCOUNT_TENURE.UNDECLARED);
    expect(body.lifetimeDollarsPurchased).toBe(LIFETIME_DOLLARS.UNDECLARED);
  });
});

describe("appleStoredAmountsToUsd", () => {
  it("converts each stored currency to USD instead of treating every amount as ZAR", async () => {
    await expect(
      appleStoredAmountsToUsd([
        { amount: 100, currency: "ZAR" },
        { amount: 10, currency: "USD" },
      ]),
    ).resolves.toBe(15);
  });
});
