import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockNotifyProviderMembershipCancelled = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantIdWithZaFallback(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyProviderMembershipCancelled: (...args: unknown[]) =>
    mockNotifyProviderMembershipCancelled(...args),
}));

describe("POST /api/me/membership/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");
    mockNotifyProviderMembershipCancelled.mockResolvedValue({ success: true });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { full_name: "Jane Customer" },
              error: null,
            })),
          })),
        })),
      })),
    });
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
                in: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      id: "membership-1",
                      user_id: "customer-1",
                      status: "active",
                      expires_at: "2026-08-01T00:00:00.000Z",
                      provider: {
                        id: "provider-1",
                        tenant_id: "tenant-za",
                        user_id: "owner-1",
                        business_name: "Acme Salon",
                      },
                      plan: { id: "plan-1", name: "Gold" },
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
    expect(body.data).toMatchObject({
      cancelled: true,
      type: "salon",
      cancel_immediately: false,
      benefits_until: "2026-08-01T00:00:00.000Z",
    });
    // Cancel-at-period-end: membership stays active with auto_renew off.
    expect(updates[0]).toMatchObject({ status: "active", auto_renew: false });
    expect(updates[0]).toHaveProperty("cancelled_at");
    expect(mockNotifyProviderMembershipCancelled).toHaveBeenCalledTimes(1);
    expect(mockNotifyProviderMembershipCancelled).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider-1",
        providerOwnerUserId: "owner-1",
        customerName: "Jane Customer",
        planName: "Gold",
        customerId: "customer-1",
        subscriptionId: "membership-1",
      }),
    );
  });

  it("does not notify the provider when no active salon membership is found", async () => {
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
        update: vi.fn(),
      })),
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/membership/cancel", {
      method: "POST",
      body: JSON.stringify({ provider_membership_id: "membership-1" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ cancelled: false });
    expect(mockNotifyProviderMembershipCancelled).not.toHaveBeenCalled();
  });
});
