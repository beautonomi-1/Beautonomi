import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenantIdWithZaFallback = vi.fn();
const mockAssertTransactionalMarketAllowedForTenantId = vi.fn();
const mockAssertSupportedMarketAddressCountry = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
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

vi.mock("@/lib/tenant/market-availability", () => ({
  assertTransactionalMarketAllowedForTenantId: (...args: unknown[]) =>
    mockAssertTransactionalMarketAllowedForTenantId(...args),
  assertSupportedMarketAddressCountry: (...args: unknown[]) =>
    mockAssertSupportedMarketAddressCountry(...args),
}));

describe("POST /api/provider/onboarding/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-1");
    mockAssertTransactionalMarketAllowedForTenantId.mockResolvedValue(null);
    mockAssertSupportedMarketAddressCountry.mockReturnValue(null);
  });

  it("skips upsert when user already owns a provider", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { id: "prov-1" }, error: null })),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected admin table: ${table}`);
      }),
    });

    const upsert = vi.fn();
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({ upsert })),
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding/draft", {
      method: "POST",
      body: JSON.stringify({ draft_data: { business_name: "X" }, current_step: 3 }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.skipped).toBe(true);
    expect(json?.data?.reason).toBe("PROVIDER_EXISTS");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("saves the draft and tracking when the user has no provider yet", async () => {
    const trackingUpsert = vi.fn(async () => ({ error: null }));
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "provider_onboarding_tracking") {
          return { upsert: trackingUpsert };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }),
    });

    const draftUpsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: "draft-1" }, error: null })),
      })),
    }));
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({ upsert: draftUpsert })),
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/onboarding/draft", {
      method: "POST",
      body: JSON.stringify({ draft_data: { business_name: "X" }, current_step: 3 }),
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json?.data?.skipped).toBeUndefined();
    expect(draftUpsert).toHaveBeenCalled();
    expect(trackingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", wizard_status: "in_progress" }),
      { onConflict: "user_id" },
    );
  });
});
