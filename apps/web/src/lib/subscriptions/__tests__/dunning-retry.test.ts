import { describe, expect, it } from "vitest";
import {
  dunningChargeIsDue,
  dunningCollectionWindowDays,
  savedCardChargeOwnsPlan,
  savedCardRenewalPeriodAnchorMs,
  savedCardRenewalShouldOpenPeriod,
} from "../dunning-retry";

describe("dunningChargeIsDue", () => {
  const now = Date.parse("2026-11-14T02:00:00.000Z");

  it("charges a card that has not been tried, and waits after a recorded attempt", () => {
    expect(dunningChargeIsDue(null, 0, now)).toBe(true);
    expect(dunningChargeIsDue(undefined, 0, now)).toBe(true);
    expect(dunningChargeIsDue("2026-11-14T02:00:00.000Z", 0, now)).toBe(false);
    expect(dunningChargeIsDue("2026-11-13T02:00:00.000Z", 0, now)).toBe(true);
    expect(dunningChargeIsDue("2026-11-13T02:00:00.000Z", 1, now)).toBe(false);
    expect(dunningChargeIsDue("2026-11-11T02:00:00.000Z", 1, now)).toBe(true);
    expect(dunningChargeIsDue(null, 3, now)).toBe(false);
  });

  it("returns a Paystack saved-card charge when another account owns the plan", () => {
    expect(savedCardChargeOwnsPlan("paystack", "paystack")).toBe(true);
    expect(savedCardChargeOwnsPlan("paystack", "manual")).toBe(true);
    expect(savedCardChargeOwnsPlan("paystack", "apple")).toBe(false);
    expect(savedCardChargeOwnsPlan("paystack", "stripe")).toBe(false);
    expect(savedCardChargeOwnsPlan("paystack", "flutterwave")).toBe(false);
    expect(savedCardChargeOwnsPlan("flutterwave", "flutterwave")).toBe(true);
    expect(savedCardChargeOwnsPlan("flutterwave", "paystack")).toBe(false);
  });

  it("starts the new paid slice at the current end date when that date is still ahead", () => {
    const paidAt = Date.parse("2026-11-14T02:00:00.000Z");
    expect(savedCardRenewalPeriodAnchorMs("2026-12-01T00:00:00.000Z", paidAt)).toBe(
      Date.parse("2026-12-01T00:00:00.000Z"),
    );
    expect(savedCardRenewalPeriodAnchorMs("2026-11-01T00:00:00.000Z", paidAt)).toBe(paidAt);
    expect(savedCardRenewalPeriodAnchorMs(null, paidAt)).toBe(paidAt);
  });

  it("opens a past-due plan once, and leaves an already-open period where it is", () => {
    expect(savedCardRenewalShouldOpenPeriod("past_due", "2026-11-01T00:00:00.000Z", now)).toBe(true);
    expect(savedCardRenewalShouldOpenPeriod("active", "2026-12-14T00:00:00.000Z", now)).toBe(false);
    expect(savedCardRenewalShouldOpenPeriod("active", "2026-11-01T00:00:00.000Z", now)).toBe(true);
  });

  it("leaves a day after the last retry before a plan can be expired for nonpayment", () => {
    expect(dunningCollectionWindowDays()).toBe(10);
  });
});
