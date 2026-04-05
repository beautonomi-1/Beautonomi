/**
 * Strict tenant resolution: /api/public/providers/[slug] returns 503 when resolver throws.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveTenantIdWithZaFallback = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({
    from: vi.fn(),
  }),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => resolveTenantIdWithZaFallback(...args),
  resolveTenantFromRequest: vi.fn(),
}));

describe("GET /api/public/providers/[slug] — tenant resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 TENANT_UNAVAILABLE when tenant resolution throws", async () => {
    resolveTenantIdWithZaFallback.mockRejectedValue(new Error("Tenant host mapping required"));

    const { GET } = await import("@/app/api/public/providers/[slug]/route");
    const req = new Request("https://unknown.example.com/api/public/providers/acme-salon", {
      headers: { host: "unknown.example.com" },
    });

    const res = await GET(req, { params: Promise.resolve({ slug: "acme-salon" }) });
    expect(res.status).toBe(503);

    const body = (await res.json()) as {
      error?: { code?: string };
    };
    expect(body.error?.code).toBe("TENANT_UNAVAILABLE");
  });
});
