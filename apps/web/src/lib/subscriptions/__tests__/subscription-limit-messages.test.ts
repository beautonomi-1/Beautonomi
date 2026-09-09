import { describe, expect, it } from "vitest";
import {
  formatProviderPortalLimitMessage,
  formatPublicCustomerBookingLimitMessage,
} from "../subscription-limit-messages";

describe("formatPublicCustomerBookingLimitMessage", () => {
  it("never tells customers to upgrade their plan", () => {
    const msg = formatPublicCustomerBookingLimitMessage({
      canProceed: false,
      reason: "Monthly booking limit reached",
      currentCount: 50,
      limitValue: 50,
      planName: "Beautonomi Starter",
      isUnlimited: false,
    });
    expect(msg).not.toMatch(/upgrade your plan/i);
    expect(msg).toMatch(/fully booked|try a different date/i);
  });
});

describe("formatProviderPortalLimitMessage", () => {
  it("uses catalog booking copy with counts", () => {
    const msg = formatProviderPortalLimitMessage({
      canProceed: false,
      reason: "Monthly booking limit reached",
      currentCount: 50,
      limitValue: 50,
      planName: "Beautonomi Starter",
      isUnlimited: false,
    });
    expect(msg).toMatch(/unlimited bookings/i);
    expect(msg).toContain("Starter");
    expect(msg.replace(/\u00a0/g, " ")).toMatch(/50/);
  });
});
