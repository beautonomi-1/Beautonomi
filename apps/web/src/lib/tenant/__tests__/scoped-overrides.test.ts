import { describe, expect, it } from "vitest";
import { resolveRequestedScope } from "@/lib/tenant/scoped-overrides";

describe("resolveRequestedScope", () => {
  const request = new Request("https://example.com/api/admin/settings");

  it("forces non-superadmins to current tenant scope", () => {
    const result = resolveRequestedScope(
      request,
      { scope: "global", tenant_id: "other-tenant" },
      "current-tenant",
      { actorRole: "admin" }
    );

    expect(result).toEqual({ scope: "tenant", tenantId: "current-tenant" });
  });

  it("allows superadmin global scope", () => {
    const result = resolveRequestedScope(
      request,
      { scope: "global" },
      "current-tenant",
      { actorRole: "superadmin" }
    );

    expect(result).toEqual({ scope: "global", tenantId: null });
  });

  it("allows superadmin tenant override", () => {
    const result = resolveRequestedScope(
      request,
      { scope: "tenant", tenant_id: "za-tenant" },
      "current-tenant",
      { actorRole: "superadmin" }
    );

    expect(result).toEqual({ scope: "tenant", tenantId: "za-tenant" });
  });
});
