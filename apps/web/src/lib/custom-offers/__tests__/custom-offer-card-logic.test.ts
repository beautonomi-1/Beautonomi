import { describe, expect, it } from "vitest";
import {
  getOfferEffectiveStatus,
  shouldShowCustomerAcceptCta,
  shouldShowCustomerResumeCta,
  shouldShowViewBookingCta,
} from "@beautonomi/ui";

const baseAttachment = {
  type: "custom_offer",
  offer_id: "offer-1",
  price: 100,
  currency: "ZAR",
  duration_minutes: 60,
};

describe("getOfferEffectiveStatus", () => {
  it("treats legacy accepted status with booking_id as paid", () => {
    const s = getOfferEffectiveStatus(baseAttachment, {
      status: "accepted",
      booking_id: "booking-1",
    });
    expect(s.isPaid).toBe(true);
    expect(s.badge?.label).toBe("Paid ✓");
    expect(shouldShowViewBookingCta(s)).toBe(true);
    expect(shouldShowCustomerAcceptCta(s, false)).toBe(false);
  });

  it("surfaces finalize_failed with needs-support badge", () => {
    const s = getOfferEffectiveStatus(baseAttachment, {
      status: "finalize_failed",
      booking_id: null,
    });
    expect(s.isFinalizeFailed).toBe(true);
    expect(s.isInactive).toBe(true);
    expect(s.badge).toEqual({ type: "needs_support", label: "Needs support" });
    expect(shouldShowCustomerAcceptCta(s, false)).toBe(false);
    expect(shouldShowCustomerResumeCta(s, false)).toBe(false);
  });

  it("marks declined offers inactive for customer accept CTA", () => {
    const s = getOfferEffectiveStatus(baseAttachment, {
      status: "declined",
      booking_id: null,
    });
    expect(s.isDeclined).toBe(true);
    expect(s.badge?.label).toBe("Declined");
    expect(shouldShowCustomerAcceptCta(s, false)).toBe(false);
  });

  it("shows resume payment CTA during payment_pending", () => {
    const s = getOfferEffectiveStatus(baseAttachment, {
      status: "payment_pending",
      booking_id: null,
    });
    expect(s.isPaymentPending).toBe(true);
    expect(shouldShowCustomerResumeCta(s, false)).toBe(true);
    expect(shouldShowCustomerAcceptCta(s, false)).toBe(false);
  });
});
