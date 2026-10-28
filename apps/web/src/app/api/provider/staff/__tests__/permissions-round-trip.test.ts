import { describe, expect, it } from "vitest";
import { normalizeStaffPermissions } from "@/lib/auth/permissions";
import { staffPermissionsToStoredJson } from "@/lib/auth/staff-permissions-payload";

/**
 * Staff permission saves normalize aliases before persisting — this is the
 * round-trip contract the mobile/web editors rely on when toggling billing access.
 */
describe("staff permissions round-trip (normalize on save)", () => {
  it("persists manage_finance when owner enables edit_settings only", () => {
    const saved = normalizeStaffPermissions({
      edit_settings: true,
      view_calendar: true,
    });
    expect(saved.edit_settings).toBe(true);
    expect(saved.manage_finance).toBe(true);
  });

  it("does not grant pay/edit_settings when manager only has manage_finance", () => {
    const saved = normalizeStaffPermissions({
      manage_finance: true,
      view_calendar: true,
    });
    expect(saved.manage_finance).toBe(true);
    expect(saved.edit_settings).toBeUndefined();
  });

  it("stores calendar_scope alongside boolean permissions", () => {
    const stored = staffPermissionsToStoredJson(
      { view_calendar: true, manage_payroll: true },
      "all",
    );
    expect(stored.manage_payroll).toBe(true);
    expect(stored.calendar_scope).toBe("all");
  });

  it("keeps manage_payroll distinct from manage_team", () => {
    const stored = staffPermissionsToStoredJson({ manage_payroll: true }, "own");
    expect(stored.manage_payroll).toBe(true);
    expect(stored.manage_team).toBeUndefined();
  });
});
