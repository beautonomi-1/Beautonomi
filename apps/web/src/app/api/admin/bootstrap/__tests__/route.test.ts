/**
 * GET /api/admin/bootstrap — auth envelope and payload shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

const mockGetSupabaseServer = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => mockGetSupabaseServer(),
}));

const mockGetSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

function grcAdminClient(assignments: Array<{ grc_role: string; expires_at: string | null }>, hubEnabled: boolean) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => (table === "grc_role_assignments" ? Object.assign(Promise.resolve({ data: assignments, error: null }), chain) : chain);
      chain.is = () => chain;
      chain.maybeSingle = async () => ({ data: { enabled: hubEnabled }, error: null });
      return chain;
    },
  };
}

describe("GET /api/admin/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSupabaseAdmin.mockImplementation(() => {
      throw new Error("Supabase admin client not configured");
    });
    mockRequireRoleInApi.mockResolvedValue({
      user: {
        ...MOCK_USERS.superadmin,
        email: MOCK_USERS.superadmin.email,
      },
    });
    mockGetSupabaseServer.mockResolvedValue(null);
  });

  it("returns 200 with user, role, is_superadmin", async () => {
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/bootstrap");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      user: expect.objectContaining({
        id: MOCK_USERS.superadmin.id,
        email: MOCK_USERS.superadmin.email,
      }),
      role: "superadmin",
      is_superadmin: true,
      grc_roles: [],
      feature_flags: { grc_hub_enabled: false },
    });
  });

  it("returns active GRC roles and hub flag when the admin client is available", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      grcAdminClient(
        [
          { grc_role: "grc_viewer", expires_at: null },
          { grc_role: "grc_expired", expires_at: "2000-01-01T00:00:00Z" },
        ],
        true,
      ),
    );
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/admin/bootstrap"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.grc_roles).toEqual(["grc_viewer"]);
    expect(body.data.feature_flags).toEqual({ grc_hub_enabled: true });
  });

  it("returns 401 when requireRoleInApi throws Authentication required", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Authentication required"));
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/bootstrap");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
