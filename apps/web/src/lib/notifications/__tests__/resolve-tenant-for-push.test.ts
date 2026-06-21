import { describe, expect, it, vi, beforeEach } from "vitest";

function createAdminMock(rows: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: rows.provider ?? null }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: rows.user ?? null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("resolveTenantIdForPush", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves tenant from provider id", async () => {
    const admin = createAdminMock({
      provider: { tenant_id: "tenant-from-provider" },
    });
    const { resolveTenantIdForPush } = await import("@/lib/notifications/resolve-tenant-for-push");
    const tid = await resolveTenantIdForPush(admin as never, { providerId: "prov-1" });
    expect(tid).toBe("tenant-from-provider");
  });

  it("resolves tenant from user preferred_home_tenant_id", async () => {
    const admin = createAdminMock({
      user: { preferred_home_tenant_id: "tenant-from-user" },
    });
    const { resolveTenantIdForPush } = await import("@/lib/notifications/resolve-tenant-for-push");
    const tid = await resolveTenantIdForPush(admin as never, { userId: "user-1" });
    expect(tid).toBe("tenant-from-user");
  });
});
