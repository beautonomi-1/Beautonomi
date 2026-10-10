/**
 * Superadmin region online gateway API — auth + response shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

function chainForRegionFound() {
  const mockSupabase = createMockSupabaseClient();
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "regions") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "reg-1", code: "GB", name: "United Kingdom" },
          error: null,
        }),
      };
    }
    if (table === "region_payment_gateways") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            gateway: "stripe",
            config: { settlement_model: "platform_mor_transfer" },
            is_primary_online: true,
            is_active: true,
          },
          error: null,
        }),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === "region_secrets") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sec-1" }, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return mockSupabase.from(table);
  });
  return mockSupabase;
}

describe("GET /api/admin/regions/[regionId]/online-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockGetSupabaseAdmin.mockReturnValue(chainForRegionFound());
  });

  it("returns region, primary gateway, and secrets_set for superadmin", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/regions/reg-1/online-gateway");
    const res = await GET(req, { params: Promise.resolve({ regionId: "reg-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.region.code).toBe("GB");
    expect(body.data.primary.gateway).toBe("stripe");
    expect(body.data.secrets_set).toBeTruthy();
    expect(typeof body.data.secrets_set.stripe_secret_key).toBe("boolean");
  });
});

describe("PATCH /api/admin/regions/[regionId]/online-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    mockGetSupabaseAdmin.mockReturnValue(chainForRegionFound());
  });

  it("accepts gateway patch and returns ok", async () => {
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/regions/reg-1/online-gateway", {
      method: "PATCH",
      body: JSON.stringify({ gateway: "stripe", settlement_model: "platform_mor_transfer" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ regionId: "reg-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.gateway).toBe("stripe");
    expect(body.data.settlement_model).toBe("platform_mor_transfer");
  });
});
