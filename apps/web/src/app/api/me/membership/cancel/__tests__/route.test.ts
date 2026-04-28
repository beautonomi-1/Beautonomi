import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

describe("POST /api/me/membership/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
  });

  it("cancels an active salon membership owned by the customer in the active tenant", async () => {
    const updates: Record<string, unknown>[] = [];
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "user_memberships") throw new Error(`Unexpected table ${table}`);
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "membership-1",
                      user_id: "customer-1",
                      provider: { id: "provider-1", tenant_id: "tenant-za" },
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            updates.push(payload);
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            };
          }),
        };
      }),
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/membership/cancel", {
      method: "POST",
      body: JSON.stringify({ provider_membership_id: "membership-1" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ cancelled: true, type: "salon" });
    expect(updates[0]).toMatchObject({ status: "cancelled" });
  });
});
