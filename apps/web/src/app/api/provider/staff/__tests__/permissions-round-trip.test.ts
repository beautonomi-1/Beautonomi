import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeStaffPermissions } from "@/lib/auth/permissions";
import { staffPermissionsToStoredJson } from "@/lib/auth/staff-permissions-payload";
import { getDefaultStaffPermissionsForDbRole } from "@/lib/provider/staff-invite-default-permissions";

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

  it("round-trips issue_refunds without granting it from process_payments", () => {
    const stored = staffPermissionsToStoredJson(
      { view_calendar: true, process_payments: true, issue_refunds: true },
      "all",
    );
    expect(stored.issue_refunds).toBe(true);
    expect(normalizeStaffPermissions(stored).issue_refunds).toBe(true);

    const paymentsOnly = staffPermissionsToStoredJson(
      { view_calendar: true, process_payments: true },
      "own",
    );
    expect(paymentsOnly.issue_refunds).toBeUndefined();
    expect(normalizeStaffPermissions(paymentsOnly).issue_refunds).toBeUndefined();
    expect(normalizeStaffPermissions(paymentsOnly).process_payments).toBe(true);
  });

  it("defaults issue_refunds on for owner and manager, off for employees", () => {
    expect(getDefaultStaffPermissionsForDbRole("owner").issue_refunds).toBe(true);
    expect(getDefaultStaffPermissionsForDbRole("manager").issue_refunds).toBe(true);
    expect(getDefaultStaffPermissionsForDbRole("employee").issue_refunds).toBe(false);
  });

  it("migration 10109 defaults match the app (owner and manager on, employee off)", () => {
    const sql = fs.readFileSync(
      path.resolve(process.cwd(), "../../supabase/migrations/10109_issue_refunds_permission.sql"),
      "utf8",
    );
    const block = (role: string) => {
      const start = sql.indexOf(`WHEN '${role}'`);
      const end = sql.indexOf("WHEN '", start + 8);
      return sql.slice(start, end > start ? end : sql.indexOf("ELSE", start));
    };
    expect(block("owner")).toContain('"issue_refunds": true');
    expect(block("manager")).toContain('"issue_refunds": true');
    expect(block("employee")).toContain('"issue_refunds": false');
  });

  it("keeps manage_payroll distinct from manage_team", () => {
    const stored = staffPermissionsToStoredJson({ manage_payroll: true }, "own");
    expect(stored.manage_payroll).toBe(true);
    expect(stored.manage_team).toBeUndefined();
  });
});
