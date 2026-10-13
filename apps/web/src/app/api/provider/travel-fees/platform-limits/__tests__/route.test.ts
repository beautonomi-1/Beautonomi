import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockFetchScopedSingle = vi.fn();
const mockResolveTenantId = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenantId(...args),
}));

vi.mock("@/lib/tenant/scoped-overrides", () => ({
  fetchScopedSingle: (...args: unknown[]) => mockFetchScopedSingle(...args),
}));

describe("GET /api/provider/travel-fees/platform-limits", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockResolveTenantId.mockResolvedValue("tenant-za");
  });

  it("allows customer role during onboarding", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-customer", role: "customer" },
    });
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          travel_fees: {
            provider_min_rate_per_km: 5,
            provider_max_rate_per_km: 40,
            allow_provider_tiered: false,
          },
        },
      },
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/travel-fees/platform-limits"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.allow_provider_tiered).toBe(false);
    expect(json?.data?.provider_min_rate_per_km).toBe(5);
    expect(mockFetchScopedSingle).toHaveBeenCalled();
    expect(mockRequireRoleInApi).toHaveBeenCalledWith(
      ["customer", "provider_owner", "provider_staff"],
      expect.any(NextRequest),
    );
  });

  it("uses tenant-scoped platform_settings via fetchScopedSingle", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "u1", role: "customer" } });
    mockFetchScopedSingle.mockResolvedValue({
      data: {
        settings: {
          travel_fees: {
            default_rate_per_km: 12,
            default_minimum_fee: 30,
            provider_min_rate_per_km: 6,
            provider_max_rate_per_km: 45,
          },
        },
      },
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/travel-fees/platform-limits"));
    const json = await res.json();

    expect(json?.data?.default_rate_per_km).toBe(12);
    expect(mockFetchScopedSingle).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-za", table: "platform_settings" }),
    );
  });
});
