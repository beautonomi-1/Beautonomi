import { describe, it, expect, vi, beforeEach } from "vitest";
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
  resolveTenantIdWithZaFallback: (...args: unknown[]) =>
    mockResolveTenantIdWithZaFallback(...args),
}));

describe("POST /api/me/orders", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects creating order for provider outside active tenant", async () => {
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user-1", role: "customer" },
    });
    mockResolveTenantIdWithZaFallback.mockResolvedValue("tenant-za");

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "providers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { tenant_id: "tenant-uk" },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseServer.mockResolvedValue(mockSupabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/orders", {
      method: "POST",
      body: JSON.stringify({
        provider_id: "22222222-2222-4222-8222-222222222222",
        fulfillment_type: "collection",
        collection_location_id: "33333333-3333-4333-8333-333333333333",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body?.error?.code).toBe("TENANT_MISMATCH");
  }, 45_000);
});

