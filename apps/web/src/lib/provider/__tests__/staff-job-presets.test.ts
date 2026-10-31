import { describe, expect, it } from "vitest";
import { resolveStaffJobPreset } from "../staff-job-presets";

describe("staff job presets", () => {
  it("front desk is not a service provider and uses receptionist permissions", () => {
    const p = resolveStaffJobPreset("front_desk");
    expect(p.is_service_provider).toBe(false);
    expect(p.enable_in_online_booking).toBe(false);
    expect(p.permissions.calendar_scope).toBe("all");
    expect(p.permissions.manage_finance).toBe(false);
    expect(p.skipServiceAssignment).toBe(true);
  });

  it("senior can create appointments on own calendar", () => {
    const p = resolveStaffJobPreset("senior");
    expect(p.permissions.calendar_scope).toBe("own");
    expect(p.permissions.create_appointments).toBe(true);
    expect(p.permissions.process_payments).toBe(true);
  });

  it("stylist cannot create appointments", () => {
    const p = resolveStaffJobPreset("stylist");
    expect(p.permissions.create_appointments).toBe(false);
  });
});
