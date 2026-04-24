import { describe, it, expect } from "vitest";
import {
  adminScopeGetAppliesToPathname,
  adminScopePathname,
  isScopedAdminCustomizationPath,
  mergeAdminScopeIntoJsonBody,
  withAdminScopeUrl,
} from "../adminScope";

describe("adminScope", () => {
  it("detects scoped paths", () => {
    expect(isScopedAdminCustomizationPath("/api/admin/settings")).toBe(true);
    expect(isScopedAdminCustomizationPath("/api/admin/providers")).toBe(false);
    expect(isScopedAdminCustomizationPath("/api/admin/maintenance")).toBe(true);
    expect(isScopedAdminCustomizationPath("/api/admin/maintenance-notify")).toBe(false);
  });

  it("withAdminScopeUrl is no-op on server", () => {
    expect(withAdminScopeUrl("/api/admin/settings", "GET")).toBe("/api/admin/settings");
  });

  it("adminScopePathname strips query", () => {
    expect(adminScopePathname("/api/admin/settings?x=1")).toBe("/api/admin/settings");
  });

  it("mergeAdminScopeIntoJsonBody adds scope for scoped POST", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem: (k: string) =>
        k === "admin_scope_mode" ? "tenant" : k === "admin_scope_tenant_id" ? "tid-1" : null,
    };
    const out = mergeAdminScopeIntoJsonBody(
      "/api/admin/settings",
      "POST",
      { foo: 1 },
      storage
    ) as Record<string, unknown>;
    expect(out.foo).toBe(1);
    expect(out.scope).toBe("tenant");
    expect(out.tenant_id).toBe("tid-1");
  });

  it("adminScopeGetAppliesToPathname skips global app-version GET", () => {
    expect(adminScopeGetAppliesToPathname("/api/admin/app-version")).toBe(false);
    expect(adminScopeGetAppliesToPathname("/api/admin/dashboard")).toBe(true);
    expect(adminScopeGetAppliesToPathname("/api/admin/bootstrap")).toBe(false);
  });

  it("mergeAdminScopeIntoJsonBody is no-op for non-scoped routes", () => {
    const storage: Pick<Storage, "getItem"> = {
      getItem: () => "tenant",
    };
    expect(mergeAdminScopeIntoJsonBody("/api/admin/bookings", "POST", { a: 1 }, storage)).toEqual({
      a: 1,
    });
  });
});
