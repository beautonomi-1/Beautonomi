import { describe, it, expect } from "vitest";
import { isScopedAdminCustomizationPath, withAdminScopeUrl } from "../adminScope";

describe("adminScope", () => {
  it("detects scoped paths", () => {
    expect(isScopedAdminCustomizationPath("/api/admin/settings")).toBe(true);
    expect(isScopedAdminCustomizationPath("/api/admin/providers")).toBe(false);
  });

  it("withAdminScopeUrl is no-op on server", () => {
    expect(withAdminScopeUrl("/api/admin/settings", "GET")).toBe("/api/admin/settings");
  });
});
