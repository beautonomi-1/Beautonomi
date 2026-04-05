/**
 * Wave 2.4 — strict tenant resolution: /api/public/home fails closed when
 * resolveTenantIdWithZaFallback throws (e.g. STRICT_TENANT_HOST_RESOLUTION + unmapped host).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTenantIdWithZaFallback = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: null, count: 0 }),
    })),
  }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => resolveTenantIdWithZaFallback(...args),
  resolveTenantFromRequest: vi.fn(),
}));

describe("GET /api/public/home — tenant resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 TENANT_UNAVAILABLE when tenant resolution throws (strict / unmapped host)", async () => {
    resolveTenantIdWithZaFallback.mockRejectedValue(new Error("Tenant host mapping required"));

    const { GET } = await import("@/app/api/public/home/route");
    const req = new Request("https://unknown-market.example.com/api/public/home", {
      headers: { host: "unknown-market.example.com" },
    });

    const res = await GET(req);
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    expect(body.error?.code).toBe("TENANT_UNAVAILABLE");
    expect(body.error?.message).toMatch(/Tenant not configured/i);
  });
});
