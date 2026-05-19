import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSupabaseAdmin = vi.fn();
const mockResolveTenant = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/tenant/resolve-tenant-from-db", () => ({
  resolveTenantIdWithZaFallback: (...args: unknown[]) => mockResolveTenant(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  notFoundResponse: (message: string) =>
    Response.json({ data: null, error: { message, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (message: string, code: string, status: number) =>
    Response.json({ data: null, error: { message, code } }, { status }),
  handleApiError: (error: unknown, fallback: string) =>
    Response.json(
      {
        data: null,
        error: { message: error instanceof Error ? error.message : fallback },
      },
      { status: 500 },
    ),
}));

type ExpressLink = {
  id: string;
  provider_id: string;
  name: string;
  slug: string;
  service_ids?: string[] | null;
  staff_ids?: string[] | null;
  location_id?: string | null;
  location_type?: string | null;
  is_active?: boolean | null;
  expires_at?: string | null;
  max_uses?: number | null;
  use_count?: number | null;
  prefill?: unknown;
};

type Fixture = {
  tenantProviders: string[];
  tenantScopedLinks: ExpressLink[];
  globalFallbackLinks: ExpressLink[];
  provider: { id: string; status: string; slug: string | null; business_name: string | null } | null;
};

function makeAdmin(fixture: Fixture, captured: { useCountUpdates: number[] }) {
  let linkQueryCall = 0;
  return {
    from(table: string) {
      if (table === "providers") {
        const tenantBuilder: any = {};
        tenantBuilder.select = () => tenantBuilder;
        tenantBuilder.eq = () => tenantBuilder;
        tenantBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: fixture.provider, error: null });
        tenantBuilder.then = (resolve: (v: unknown) => void) =>
          resolve({ data: fixture.tenantProviders.map((id) => ({ id })), error: null });
        return tenantBuilder;
      }
      if (table === "express_booking_links") {
        const b: any = {};
        b.select = () => b;
        b.ilike = () => b;
        b.in = () => b;
        b.order = () => b;
        b.limit = () => b;
        b.then = (resolve: (v: unknown) => void) => {
          linkQueryCall += 1;
          // First call = tenant-scoped (with `in("provider_id", …)`).
          // Subsequent calls = global fallback then loose normalised scan.
          if (linkQueryCall === 1) {
            resolve({ data: fixture.tenantScopedLinks, error: null });
          } else {
            resolve({ data: fixture.globalFallbackLinks, error: null });
          }
        };
        b.update = (payload: { use_count?: number }) => ({
          eq: vi.fn().mockImplementation(() => {
            if (typeof payload.use_count === "number") {
              captured.useCountUpdates.push(payload.use_count);
            }
            return Promise.resolve({ data: null, error: null });
          }),
        });
        return b;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

const ACTIVE_PROVIDER = {
  id: "provider-1",
  status: "active",
  slug: "salon-co",
  business_name: "Salon Co",
};

const VALID_LINK: ExpressLink = {
  id: "link-1",
  provider_id: "provider-1",
  name: "Quick book",
  slug: "abc",
  service_ids: ["s1"],
  staff_ids: [],
  location_id: null,
  location_type: "at_home",
  is_active: true,
  use_count: 3,
  prefill: { promotion_code: "WELCOME" },
};

async function callRoute(slug: string) {
  const { GET } = await import("../route");
  const req = new NextRequest(`https://app.example.com/api/public/express-link/${slug}`);
  return GET(req, { params: Promise.resolve({ slug }) });
}

describe("GET /api/public/express-link/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockResolveTenant.mockResolvedValue("tenant-1");
  });

  it("resolves an active link, increments use_count, and returns sanitized prefill", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [VALID_LINK],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.provider_slug).toBe("salon-co");
    expect(body.data.provider_id).toBe("provider-1");
    expect(body.data.prefill).toEqual({ promotion_code: "WELCOME" });
    expect(captured.useCountUpdates).toEqual([4]);
  });

  it("returns 404 when link is over max_uses", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [{ ...VALID_LINK, max_uses: 2, use_count: 2 }],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    expect(res.status).toBe(404);
    expect(captured.useCountUpdates).toEqual([]);
  });

  it("returns 404 when link is expired", async () => {
    const captured = { useCountUpdates: [] as number[] };
    const expired = {
      ...VALID_LINK,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [expired],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    expect(res.status).toBe(404);
  });

  it("returns 404 when link is inactive", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [{ ...VALID_LINK, is_active: false }],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    expect(res.status).toBe(404);
  });

  it("falls back to the global slug pool when tenant mapping has no link", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["other-provider"],
          tenantScopedLinks: [],
          globalFallbackLinks: [VALID_LINK],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.provider_id).toBe("provider-1");
  });

  it("rejects an invalid slug input", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("!!@@##");
    expect(res.status).toBe(404);
  });

  it("returns 404 when provider is not active", async () => {
    const captured = { useCountUpdates: [] as number[] };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [VALID_LINK],
          globalFallbackLinks: [],
          provider: { ...ACTIVE_PROVIDER, status: "draft" },
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    expect(res.status).toBe(404);
    expect(captured.useCountUpdates).toEqual([]);
  });

  it("drops unknown prefill keys", async () => {
    const captured = { useCountUpdates: [] as number[] };
    const linkWithJunk = {
      ...VALID_LINK,
      prefill: {
        promotion_code: "WELCOME",
        not_a_real_field: "evil",
      },
    };
    mockGetSupabaseAdmin.mockReturnValue(
      makeAdmin(
        {
          tenantProviders: ["provider-1"],
          tenantScopedLinks: [linkWithJunk],
          globalFallbackLinks: [],
          provider: ACTIVE_PROVIDER,
        },
        captured,
      ),
    );

    const res = await callRoute("abc");
    const body = await res.json();
    expect(body.data.prefill).toEqual({ promotion_code: "WELCOME" });
    expect((body.data.prefill as Record<string, unknown>).not_a_real_field).toBeUndefined();
  });
});
