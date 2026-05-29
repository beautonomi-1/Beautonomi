import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveTenantFromRequest, getSupabaseAdmin } = vi.hoisted(() => ({
  resolveTenantFromRequest: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantFromRequest,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin,
}));

import {
  assignPreferredHomeTenantFromHostIfUnset,
  resolveSignupHostTenantId,
} from "@/lib/tenant/assign-preferred-home-tenant-from-host";

function requestWithHost(host: string): Request {
  return new Request("https://example.test/api/me/profile", {
    headers: { host },
  });
}

describe("resolveSignupHostTenantId", () => {
  beforeEach(() => {
    resolveTenantFromRequest.mockReset();
    getSupabaseAdmin.mockReset();
    delete process.env.DEV_DEFAULT_TENANT_SLUG;
    vi.stubEnv("NODE_ENV", "test");
  });

  it("returns host-mapped tenant id", async () => {
    resolveTenantFromRequest.mockResolvedValue({
      id: "tenant-za",
      slug: "za",
      is_active: true,
    });

    await expect(resolveSignupHostTenantId(requestWithHost("za.beautonomi.com"))).resolves.toBe(
      "tenant-za",
    );
  });

  it("skips global slug tenant", async () => {
    resolveTenantFromRequest.mockResolvedValue({
      id: "tenant-global",
      slug: "global",
      is_active: true,
    });

    await expect(resolveSignupHostTenantId(requestWithHost("beautonomi.com"))).resolves.toBeNull();
  });

  it("uses DEV_DEFAULT_TENANT_SLUG on localhost when host is unmapped", async () => {
    resolveTenantFromRequest.mockResolvedValue(null);
    process.env.DEV_DEFAULT_TENANT_SLUG = "za";
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "dev-tenant", slug: "za" }, error: null }),
            }),
          }),
        }),
      }),
    });

    await expect(resolveSignupHostTenantId(requestWithHost("localhost:3000"))).resolves.toBe(
      "dev-tenant",
    );
  });
});

describe("assignPreferredHomeTenantFromHostIfUnset", () => {
  const update = vi.fn();
  const selectUser = vi.fn();
  const selectTenant = vi.fn();

  beforeEach(() => {
    resolveTenantFromRequest.mockReset();
    selectUser.mockReset();
    selectTenant.mockReset();
    update.mockReset();
    resolveTenantFromRequest.mockResolvedValue({
      id: "tenant-za",
      slug: "za",
      is_active: true,
    });
  });

  function supabaseMock() {
    return {
      from: (table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: selectUser,
              }),
            }),
            update: (payload: unknown) => {
              update(payload);
              return {
                eq: () => ({
                  is: () => Promise.resolve({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "tenants") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: selectTenant,
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  it("does nothing when preferred_home_tenant_id is already set", async () => {
    selectUser.mockResolvedValue({ data: { preferred_home_tenant_id: "existing" }, error: null });

    const assigned = await assignPreferredHomeTenantFromHostIfUnset(
      supabaseMock() as never,
      "user-1",
      requestWithHost("za.beautonomi.com"),
    );

    expect(assigned).toBe("existing");
    expect(update).not.toHaveBeenCalled();
  });

  it("assigns host tenant when unset", async () => {
    selectUser.mockResolvedValue({ data: { preferred_home_tenant_id: null }, error: null });
    selectTenant.mockResolvedValue({ data: { id: "tenant-za", slug: "za" }, error: null });

    const assigned = await assignPreferredHomeTenantFromHostIfUnset(
      supabaseMock() as never,
      "user-1",
      requestWithHost("za.beautonomi.com"),
    );

    expect(assigned).toBe("tenant-za");
    expect(update).toHaveBeenCalledWith({ preferred_home_tenant_id: "tenant-za" });
  });

  it("prefers explicit tenant id over host resolution", async () => {
    selectUser.mockResolvedValue({ data: { preferred_home_tenant_id: null }, error: null });
    selectTenant.mockResolvedValue({ data: { id: "tenant-explicit", slug: "uk" }, error: null });

    const assigned = await assignPreferredHomeTenantFromHostIfUnset(
      supabaseMock() as never,
      "user-1",
      requestWithHost("za.beautonomi.com"),
      "tenant-explicit",
    );

    expect(assigned).toBe("tenant-explicit");
    expect(resolveTenantFromRequest).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ preferred_home_tenant_id: "tenant-explicit" });
  });
});
