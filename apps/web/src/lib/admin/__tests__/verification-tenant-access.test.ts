import { describe, expect, it, vi } from "vitest";
import {
  filterVerificationsForAdminTenant,
  verificationAccessibleToAdminTenant,
} from "../verification-tenant-access";

vi.mock("@/lib/tenant/admin-user-tenant-access", () => ({
  getUserRowIfAccessibleToAdminTenant: vi.fn(async (_admin, _tenantId, userId: string) =>
    userId === "in-scope" ? { id: userId } : null,
  ),
}));

describe("verificationAccessibleToAdminTenant", () => {
  it("allows rows with matching tenant_id", async () => {
    const ok = await verificationAccessibleToAdminTenant({} as never, "tenant-1", {
      id: "v1",
      tenant_id: "tenant-1",
      user_id: "u1",
    });
    expect(ok).toBe(true);
  });

  it("allows null tenant_id when user is in admin scope", async () => {
    const ok = await verificationAccessibleToAdminTenant({} as never, "tenant-1", {
      id: "v2",
      tenant_id: null,
      user_id: "in-scope",
    });
    expect(ok).toBe(true);
  });

  it("rejects null tenant_id when user is outside scope", async () => {
    const ok = await verificationAccessibleToAdminTenant({} as never, "tenant-1", {
      id: "v3",
      tenant_id: null,
      user_id: "outside",
    });
    expect(ok).toBe(false);
  });
});

describe("filterVerificationsForAdminTenant", () => {
  it("returns tenant rows plus in-scope null-tenant rows sorted by submitted_at desc", async () => {
    const rows = await filterVerificationsForAdminTenant({} as never, "tenant-1", [
      { id: "a", tenant_id: "tenant-1", user_id: "u1", submitted_at: "2026-05-01T00:00:00Z" },
      { id: "b", tenant_id: null, user_id: "in-scope", submitted_at: "2026-05-03T00:00:00Z" },
      { id: "c", tenant_id: null, user_id: "outside", submitted_at: "2026-05-04T00:00:00Z" },
      { id: "d", tenant_id: "other", user_id: "u2", submitted_at: "2026-05-02T00:00:00Z" },
    ]);

    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
