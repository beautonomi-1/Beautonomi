import { describe, it, expect } from "vitest";
import { getDefaultStaffPermissionsForDbRole } from "../staff-invite-default-permissions";

describe("getDefaultStaffPermissionsForDbRole", () => {
  it("gives employees a tightened own-calendar pack (bookable, own bookings, own earnings; no POS/cancel/team)", () => {
    const employee = getDefaultStaffPermissionsForDbRole("employee");
    expect(employee.view_calendar).toBe(true);
    expect(employee.calendar_scope).toBe("own");
    expect(employee.edit_appointments).toBe(true);
    expect(employee.view_own_earnings).toBe(true);
    expect(employee.view_clients).toBe(true);
    expect(employee.create_appointments).toBe(false);
    expect(employee.cancel_appointments).toBe(false);
    expect(employee.create_sales).toBe(false);
    expect(employee.process_payments).toBe(false);
    expect(employee.view_team).toBe(false);
    expect(employee.manage_team).toBe(false);
    expect(employee.edit_settings).toBe(false);
    expect(employee.view_reports).toBe(false);
    expect(employee.delete_appointments).toBe(false);
  });

  it("receptionist preset grants front-desk bookings + POS without finance", async () => {
    const { getReceptionistPresetPermissions } = await import("../staff-invite-default-permissions");
    const receptionist = getReceptionistPresetPermissions();
    expect(receptionist.calendar_scope).toBe("all");
    expect(receptionist.create_appointments).toBe(true);
    expect(receptionist.cancel_appointments).toBe(true);
    expect(receptionist.process_payments).toBe(true);
    expect(receptionist.manage_finance).toBe(false);
    expect(receptionist.view_reports).toBe(false);
    expect(receptionist.edit_settings).toBe(false);
  });

  it("gives managers ops + manage_team but not edit_settings", () => {
    const manager = getDefaultStaffPermissionsForDbRole("manager");
    expect(manager.view_team).toBe(true);
    expect(manager.manage_team).toBe(true);
    expect(manager.edit_services).toBe(true);
    expect(manager.view_reports).toBe(true);
    expect(manager.edit_settings).toBe(false);
  });

  it("gives owners full permissions", () => {
    const owner = getDefaultStaffPermissionsForDbRole("owner");
    expect(owner.manage_team).toBe(true);
    expect(owner.edit_settings).toBe(true);
    expect(owner.process_payments).toBe(true);
  });
});
