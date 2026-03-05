/**
 * GET /api/me/portal: requires auth, returns role, portal, provider_id, provider_status.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireAuthInApi = vi.fn();
const mockGetUserRoleServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: any[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/auth/role", () => ({
  getUserRoleServer: (...args: any[]) => mockGetUserRoleServer(...args),
  getPortalForUser: (params: { role: string; provider_status?: string | null }) => {
    if (params.role === "superadmin") return "admin";
    if (params.role === "customer") return "customer";
    if (params.role === "provider_owner" || params.role === "provider_staff") {
      return params.provider_status === "active" ? "provider" : "provider_onboarding";
    }
    return "customer";
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({}),
}));

describe("GET /api/me/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "returns error status when not authenticated",
    async () => {
      mockRequireAuthInApi.mockRejectedValue(new Error("Authentication required"));
      const { GET } = await import("../route");
      const req = new NextRequest("http://localhost/api/me/portal");
      const res = await GET(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      expect(body.data).toBeNull();
    },
    15000
  );

  it("returns 200 with customer portal for customer role", async () => {
    mockRequireAuthInApi.mockResolvedValue(undefined);
    mockGetUserRoleServer.mockResolvedValue({
      userId: MOCK_USERS.customer.id,
      role: "customer",
      provider_id: null,
      provider_status: null,
    });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      role: "customer",
      portal: "customer",
      provider_id: null,
      provider_status: null,
    });
    expect(body.error).toBeNull();
  });

  it("returns 200 with provider portal and provider_id for provider_owner active", async () => {
    mockRequireAuthInApi.mockResolvedValue(undefined);
    const providerId = "prov-0000-0000-0000-000000000001";
    mockGetUserRoleServer.mockResolvedValue({
      userId: MOCK_USERS.provider_owner.id,
      role: "provider_owner",
      provider_id: providerId,
      provider_status: "active",
    });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.role).toBe("provider_owner");
    expect(body.data.portal).toBe("provider");
    expect(body.data.provider_id).toBe(providerId);
    expect(body.data.provider_status).toBe("active");
    expect(body.error).toBeNull();
  });

  it("returns 200 with admin portal for superadmin", async () => {
    mockRequireAuthInApi.mockResolvedValue(undefined);
    mockGetUserRoleServer.mockResolvedValue({
      userId: MOCK_USERS.superadmin.id,
      role: "superadmin",
      provider_id: null,
      provider_status: null,
    });
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.portal).toBe("admin");
    expect(body.data.role).toBe("superadmin");
    expect(body.error).toBeNull();
  });

  it("returns 401 when getUserRoleServer returns null (profile not found)", async () => {
    mockRequireAuthInApi.mockResolvedValue(undefined);
    mockGetUserRoleServer.mockResolvedValue(null);
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
