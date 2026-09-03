import { describe, expect, it } from "vitest";
import { buildProviderBookingActionModel } from "../action-policy";

describe("at-home primaryAction hierarchy", () => {
  it("prioritizes start_journey when confirmed and today", () => {
    const model = buildProviderBookingActionModel({
      id: "b1",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "confirmed",
      scheduled_at: new Date().toISOString(),
    });
    expect(model.primaryAction?.id).toBe("start_journey");
  });

  it("prioritizes mark_arrived when en route", () => {
    const model = buildProviderBookingActionModel({
      id: "b2",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_on_way",
      scheduled_at: new Date().toISOString(),
    });
    expect(model.primaryAction?.id).toBe("mark_arrived");
  });

  it("prioritizes start_service after arrival verification", () => {
    const model = buildProviderBookingActionModel({
      id: "b3",
      status: "confirmed",
      location_type: "at_home",
      current_stage: "provider_arrived",
      arrival_otp_verified: true,
      scheduled_at: new Date().toISOString(),
    });
    expect(model.primaryAction?.id).toBe("start_service");
  });
});
