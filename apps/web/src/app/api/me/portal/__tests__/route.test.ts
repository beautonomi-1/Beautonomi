/**
 * GET /api/me/portal: requires auth, returns role, portal, provider_id, provider_status.
 * §Release-audit 2026-04: covers the new self-heal path that upserts a missing
 * `public.users` row before returning 401 (mobile/Bearer resilience).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireAuthInApi = vi.fn();
const mockGetUserRoleServer = vi.fn();
const mockEnsurePublicUserRowExists = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: any[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/auth/role-server", () => ({
  getUserRoleServer: (...args: any[]) => mockGetUserRoleServer(...args),
  ensurePublicUserRowExists: (...args: any[]) => mockEnsurePublicUserRowExists(...args),
}));

vi.mock("@/lib/auth/role", () => ({
  getPortalForUser: (params: { role: string; provider_status?: string | null }) => {
    if (params.role === "superadmin") return "admin";
    if (params.role === "customer") return "customer";
    if (params.role === "provider_onboarding") return "provider_onboarding";
    if (params.role === "provider_owner" || params.role === "provider_staff") {
      return params.provider_status === "active" ? "provider" : "provider_onboarding";
    }
    return "customer";
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({}),
}));

function authUserLike(id: string, email = "test@example.com") {
  return { id, email, user_metadata: {} };
}

describe("GET /api/me/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsurePublicUserRowExists.mockResolvedValue(false);
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
    mockRequireAuthInApi.mockResolvedValue({ user: authUserLike(MOCK_USERS.customer.id) });
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
    expect(mockEnsurePublicUserRowExists).not.toHaveBeenCalled();
  });

  it("returns 200 with provider portal and provider_id for provider_owner active", async () => {
    mockRequireAuthInApi.mockResolvedValue({
      user: authUserLike(MOCK_USERS.provider_owner.id),
    });
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
    mockRequireAuthInApi.mockResolvedValue({
      user: authUserLike(MOCK_USERS.superadmin.id),
    });
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

  // §Release-audit 2026-04: new self-heal behaviour
  it("self-heals missing public.users row and returns portal on retry", async () => {
    mockRequireAuthInApi.mockResolvedValue({
      user: authUserLike(MOCK_USERS.customer.id, "newbie@example.com"),
    });
    mockGetUserRoleServer
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: MOCK_USERS.customer.id,
        role: "customer",
        provider_id: null,
        provider_status: null,
      });
    mockEnsurePublicUserRowExists.mockResolvedValue(true);

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.portal).toBe("customer");
    expect(body.data.role).toBe("customer");
    expect(mockEnsurePublicUserRowExists).toHaveBeenCalledOnce();
    expect(mockGetUserRoleServer).toHaveBeenCalledTimes(2);
  });

  it("returns 401 when self-heal fails and role still cannot be resolved", async () => {
    mockRequireAuthInApi.mockResolvedValue({
      user: authUserLike(MOCK_USERS.customer.id, "newbie@example.com"),
    });
    mockGetUserRoleServer.mockResolvedValue(null);
    mockEnsurePublicUserRowExists.mockResolvedValue(false);

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockEnsurePublicUserRowExists).toHaveBeenCalledOnce();
    // getUserRoleServer called only once because heal failed (no retry)
    expect(mockGetUserRoleServer).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when getUserRoleServer returns null (profile not found) and self-heal silently fails", async () => {
    mockRequireAuthInApi.mockResolvedValue({
      user: authUserLike(MOCK_USERS.customer.id),
    });
    mockGetUserRoleServer.mockResolvedValue(null);
    mockEnsurePublicUserRowExists.mockResolvedValue(false);

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/portal");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
