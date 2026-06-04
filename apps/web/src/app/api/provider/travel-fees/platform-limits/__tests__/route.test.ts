import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();

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

describe("GET /api/provider/travel-fees/platform-limits", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("allows customer role during onboarding", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-customer", role: "customer" },
    });
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                settings: {
                  travel_fees: {
                    provider_min_rate_per_km: 5,
                    provider_max_rate_per_km: 40,
                    allow_provider_tiered: false,
                  },
                },
              },
              error: null,
            })),
          })),
        })),
      })),
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/travel-fees/platform-limits"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.allow_provider_tiered).toBe(false);
    expect(json?.data?.provider_min_rate_per_km).toBe(5);
    expect(mockRequireRoleInApi).toHaveBeenCalledWith(
      ["customer", "provider_owner", "provider_staff"],
      expect.any(NextRequest),
    );
  });
});
