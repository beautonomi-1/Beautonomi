import {
  buildConfirmedAfterInlineConfirmModel,
  buildProviderBookingCreatedSuccessModel,
  isPendingPaymentBlocked,
  needsProviderConfirmation,
  resolveBookingLifecycleStatus,
} from "@/lib/provider-booking-created-success";

describe("needsProviderConfirmation", () => {
  it("returns true for pending and pending_payment", () => {
    expect(needsProviderConfirmation("pending")).toBe(true);
    expect(needsProviderConfirmation("pending", "pending_payment")).toBe(true);
  });

  it("returns false for booked/confirmed", () => {
    expect(needsProviderConfirmation("booked")).toBe(false);
    expect(needsProviderConfirmation("confirmed")).toBe(false);
  });
});

describe("resolveBookingLifecycleStatus", () => {
  it("prefers dbStatus over mapped provider status", () => {
    expect(resolveBookingLifecycleStatus({ status: "pending", dbStatus: "pending_payment" })).toBe(
      "pending_payment",
    );
  });
});

describe("buildProviderBookingCreatedSuccessModel", () => {
  it("shows confirm + review CTAs for pending with notification note when silent", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      clientName: "Jane Doe",
      date: "Mon 21 Jun",
      time: "10:00",
      bookingNumber: "BK-123",
      sendNotification: false,
    });
    expect(model.showConfirmCta).toBe(true);
    expect(model.showReviewCta).toBe(true);
    expect(model.showViewCta).toBe(false);
    expect(model.bannerBody).toContain("was not notified at creation");
    expect(model.summaryLines).toContain("Jane Doe");
    expect(model.summaryLines).toContain("Ref BK-123");
  });

  it("notes outstanding payment on pending bookings without blocking confirm", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      paymentStatus: "pending",
      clientName: "Alex",
    });
    expect(model.showConfirmCta).toBe(true);
    expect(model.bannerBody).toContain("Payment is still outstanding");
  });

  it("does not show payment note when payment is already collected", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      paymentStatus: "paid",
      clientName: "Jane",
    });
    expect(model.showConfirmCta).toBe(true);
    expect(model.bannerBody).not.toContain("Payment is still outstanding");
  });

  it("blocks confirm for pending_payment with unsettled payment", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      dbStatus: "pending_payment",
      paymentStatus: "pending",
      clientName: "Alex",
    });
    expect(model.showConfirmCta).toBe(false);
    expect(model.showReviewCta).toBe(true);
    expect(model.confirmBlockedReason).toMatch(/payment/i);
  });

  it("shows view CTA only for confirmed bookings", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "booked",
      clientName: "Sam",
      isWalkIn: true,
    });
    expect(model.showConfirmCta).toBe(false);
    expect(model.showReviewCta).toBe(false);
    expect(model.showViewCta).toBe(true);
    expect(model.title).toBe("Walk-in booked");
    expect(model.bannerTone).toBe("green");
  });
});

describe("buildConfirmedAfterInlineConfirmModel", () => {
  it("switches to confirmed presentation", () => {
    const model = buildConfirmedAfterInlineConfirmModel({
      clientName: "Jane",
      sendNotification: false,
    });
    expect(model.showViewCta).toBe(true);
    expect(model.showConfirmCta).toBe(false);
    expect(model.bannerTone).toBe("green");
  });
});

describe("isPendingPaymentBlocked", () => {
  it("detects pending_payment with unsettled payment only", () => {
    expect(isPendingPaymentBlocked("pending", "pending_payment", "pending")).toBe(true);
    expect(isPendingPaymentBlocked("pending_payment", null, "pending")).toBe(true);
    expect(isPendingPaymentBlocked("pending", "pending_payment", "paid")).toBe(false);
  });
});
