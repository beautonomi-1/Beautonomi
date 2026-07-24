import { describe, it, expect } from "vitest";
import { getDefaultStaffPermissionsForDbRole } from "../staff-invite-default-permissions";

describe("getDefaultStaffPermissionsForDbRole", () => {
  it("gives employees floor-ops access without owner tools", () => {
    const employee = getDefaultStaffPermissionsForDbRole("employee");
    expect(employee.view_calendar).toBe(true);
    expect(employee.edit_appointments).toBe(true);
    expect(employee.cancel_appointments).toBe(true);
    expect(employee.create_sales).toBe(true);
    expect(employee.process_payments).toBe(true);
    expect(employee.edit_clients).toBe(true);
    expect(employee.view_team).toBe(true);
    expect(employee.manage_team).toBe(false);
    expect(employee.edit_settings).toBe(false);
    expect(employee.view_reports).toBe(false);
    expect(employee.delete_appointments).toBe(false);
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
