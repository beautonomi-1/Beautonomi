/**
 * Strict tenant resolution: /api/public/search returns 503 when host cannot resolve (e.g. strict mode).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTenantIdWithZaFallback = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => resolveTenantIdWithZaFallback(...args),
  resolveTenantFromRequest: vi.fn(),
}));

describe("GET /api/public/search — tenant resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 TENANT_UNAVAILABLE when tenant resolution throws", async () => {
    resolveTenantIdWithZaFallback.mockRejectedValue(new Error("Tenant host mapping required"));

    const { GET } = await import("@/app/api/public/search/route");
    const req = new Request("https://unknown.example.com/api/public/search?q=hair", {
      headers: { host: "unknown.example.com" },
    });

    const res = await GET(req);
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe("TENANT_UNAVAILABLE");
  });
});
