import {
  buildProviderBookingActionModel,
  mapProviderBookingActionError,
} from "@/lib/provider-booking-action-policy";

describe("buildProviderBookingActionModel", () => {
  it("enables confirm for paid-but-pending bookings and explains payment lifecycle separation", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-1",
      db_status: "pending",
      payment_status: "paid",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryListAction?.label).toBe("Confirm");
    expect(model.primaryListAction?.dbTarget).toBe("confirmed");
    expect(model.paymentLifecycleNote).toMatch(/Payment is settled/);
  });

  it("blocks at-home start service until arrival is verified", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-2",
      db_status: "checked_in",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_pending: true,
      arrival_otp_verified: false,
      qr_code_verified: false,
    });

    expect(model.statusTargets).not.toContain("in_progress");
    expect(model.disabledReasons[0]).toMatch(/PIN or QR/);
  });

  it("maps structured backend errors into provider-facing copy", () => {
    expect(mapProviderBookingActionError("raw", "CONFLICT")).toMatch(/updated elsewhere/);
    expect(mapProviderBookingActionError(null, "VERIFICATION_NOT_COMPLETE")).toMatch(/PIN or QR/);
  });
});
