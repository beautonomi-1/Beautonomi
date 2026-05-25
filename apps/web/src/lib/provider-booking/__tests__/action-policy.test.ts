import { describe, expect, it } from "vitest";
import { buildProviderBookingActionModel } from "../action-policy";

describe("buildProviderBookingActionModel", () => {
  it("prioritizes salon happy path actions", () => {
    const confirmed = buildProviderBookingActionModel({
      id: "booking-1",
      status: "confirmed",
      location_type: "at_salon",
      scheduled_at: new Date().toISOString(),
    });

    expect(confirmed.primaryAction?.id).toBe("check_in");
    expect(confirmed.happyPath).toEqual(["Confirm", "Check in", "Start", "Complete"]);

    const checkedIn = buildProviderBookingActionModel({
      id: "booking-1",
      status: "checked_in",
      location_type: "at_salon",
      scheduled_at: new Date().toISOString(),
    });

    expect(checkedIn.primaryAction?.id).toBe("start_service");
  });

  it("uses journey actions before status actions for house calls", () => {
    const model = buildProviderBookingActionModel({
      id: "booking-2",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "confirmed",
      scheduled_at: new Date().toISOString(),
    });

    expect(model.primaryAction?.id).toBe("start_journey");
    expect(model.actions.map((action) => action.id)).toContain("start_journey");
    expect(model.actions.map((action) => action.id)).not.toContain("check_in");
  });

  it("blocks house-call start service until arrival verification completes", () => {
    const blocked = buildProviderBookingActionModel({
      id: "booking-3",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_pending: true,
      arrival_otp_verified: false,
    });

    expect(blocked.actions.map((action) => action.id)).not.toContain("start_service");
    expect(blocked.disabledReasons[0]).toMatch(/verification/i);

    const ready = buildProviderBookingActionModel({
      id: "booking-3",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_pending: true,
      arrival_otp_verified: true,
    });

    expect(ready.primaryAction?.id).toBe("start_service");
  });
});
