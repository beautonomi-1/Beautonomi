import {
  buildConfirmedAfterInlineConfirmModel,
  buildProviderBookingCreatedSuccessModel,
  isPendingPaymentBlocked,
  needsProviderConfirmation,
  resolveBookingLifecycleStatus,
} from "@/lib/provider-booking/provider-booking-created-success";

describe("provider-booking-created-success", () => {
  it("prefers dbStatus for lifecycle resolution", () => {
    expect(resolveBookingLifecycleStatus({ status: "pending", dbStatus: "pending_payment" })).toBe(
      "pending_payment",
    );
  });

  it("allows confirm on pending with outstanding payment (provider portal create)", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      paymentStatus: "pending",
    });
    expect(model.showConfirmCta).toBe(true);
    expect(model.bannerBody).toContain("Payment is still outstanding");
  });

  it("does not show payment note when payment is already collected", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      paymentStatus: "paid",
    });
    expect(model.showConfirmCta).toBe(true);
    expect(model.bannerBody).not.toContain("Payment is still outstanding");
  });

  it("blocks confirm for pending_payment lifecycle with unsettled payment", () => {
    const model = buildProviderBookingCreatedSuccessModel({
      status: "pending",
      dbStatus: "pending_payment",
      paymentStatus: "pending",
    });
    expect(model.showConfirmCta).toBe(false);
    expect(isPendingPaymentBlocked("pending", "pending_payment", "pending")).toBe(true);
  });

  it("transitions to confirmed presentation after inline confirm", () => {
    const model = buildConfirmedAfterInlineConfirmModel({ clientName: "Sam" });
    expect(model.showViewCta).toBe(true);
    expect(needsProviderConfirmation("booked")).toBe(false);
  });
});
