/**
 * Unit tests for Host → tenant resolution (resolveTenantFromRequest,
 * resolveTenantIdWithZaFallback). Mocks admin Supabase and tenant domain env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const maybeSingle = vi.fn();

/** Supabase-style chain: any depth of .select().eq()... .maybeSingle() */
function queryBuilder() {
  const b = {
    select: () => b,
    eq: () => b,
    maybeSingle,
  };
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => queryBuilder(),
  }),
}));

vi.mock("@/lib/tenant/tenant-domain-environment", () => ({
  getTenantDomainEnvironment: () => "production" as const,
  tenantDomainFallbackToProductionEnabled: () => false,
}));

import {
  resolveTenantFromRequest,
  resolveTenantIdWithZaFallback,
} from "@/lib/tenant/resolve-tenant-from-db";

function requestWithHost(host: string): Request {
  return new Request("https://example.test/api", {
    headers: { host },
  });
}

const sampleTenantRow = {
  id: "tenant-1",
  slug: "acme",
  name: "Acme",
  region_code: "US",
  lifecycle: "active",
  default_currency: "USD",
  default_language: "en",
  default_timezone: "America/New_York",
  is_active: true,
};

describe("resolveTenantFromRequest", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("returns tenant row when tenant_domains maps host to active tenant", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { tenant_id: "tenant-1" }, error: null })
      .mockResolvedValueOnce({ data: sampleTenantRow, error: null });

    const req = requestWithHost("bookings.acme.test");
    const row = await resolveTenantFromRequest(req);

    expect(row).not.toBeNull();
    expect(row?.slug).toBe("acme");
    expect(row?.region_code).toBe("US");
    expect(maybeSingle).toHaveBeenCalled();
  });

  it("returns null when host is not mapped", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const row = await resolveTenantFromRequest(requestWithHost("unknown.example.com"));
    expect(row).toBeNull();
  });

  it("prefers x-forwarded-host over host when both present", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { tenant_id: "tenant-edge" }, error: null })
      .mockResolvedValueOnce({
        data: { ...sampleTenantRow, id: "tenant-edge", slug: "edge" },
        error: null,
      });

    const req = new Request("https://internal/api", {
      headers: {
        host: "internal-lb.local:8080",
        "x-forwarded-host": "customer-facing.app",
      },
    });
    const row = await resolveTenantFromRequest(req);
    expect(row?.id).toBe("tenant-edge");
    expect(row?.slug).toBe("edge");
  });
});

describe("resolveTenantIdWithZaFallback", () => {
  const prevStrict = process.env.STRICT_TENANT_HOST_RESOLUTION;

  beforeEach(() => {
    maybeSingle.mockReset();
    delete process.env.STRICT_TENANT_HOST_RESOLUTION;
  });

  afterEach(() => {
    if (prevStrict === undefined) {
      delete process.env.STRICT_TENANT_HOST_RESOLUTION;
    } else {
      process.env.STRICT_TENANT_HOST_RESOLUTION = prevStrict;
    }
  });

  it("returns mapped tenant id when host resolves", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { tenant_id: "tenant-1" }, error: null })
      .mockResolvedValueOnce({ data: sampleTenantRow, error: null });

    const id = await resolveTenantIdWithZaFallback(requestWithHost("acme.app"));
    expect(id).toBe("tenant-1");
  });

  it("when STRICT_TENANT_HOST_RESOLUTION=true, throws if host unmapped", async () => {
    process.env.STRICT_TENANT_HOST_RESOLUTION = "true";
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      resolveTenantIdWithZaFallback(requestWithHost("orphan.host")),
    ).rejects.toThrow("Tenant host mapping required");
  });

  it("when strict off, falls back to za tenant id", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "za-uuid" }, error: null });

    const id = await resolveTenantIdWithZaFallback(requestWithHost("orphan.host"));
    expect(id).toBe("za-uuid");
  });
});
