/**
 * GET /api/me/account-status — deactivated vs provider org suspension (owner + staff).
 * The web app `test` script runs the main suite with --exclude for this folder's tests,
 * then runs this file in a second vitest process so vi.mock api-helpers does not leak.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_USERS } from "@/__tests__/helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

const mockUsersSingle = vi.fn();
const mockProvidersMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: () => mockUsersSingle(),
            }),
          }),
        };
      }
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: () => mockProvidersMaybeSingle(),
            }),
          }),
        };
      }
      return {};
    }),
  }),
}));

describe("GET /api/me/account-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviderIdForUser.mockResolvedValue(null);
    mockUsersSingle.mockResolvedValue({
      data: { deactivated_at: null, deactivated_by: null, role: "customer" },
      error: null,
    });
  });

  it("returns error when requireRoleInApi fails", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/account-status"));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns not suspended for customer", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.customer });
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/account-status"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ is_suspended: false, is_deactivated: false });
    expect(mockGetProviderIdForUser).not.toHaveBeenCalled();
  });

  it("returns deactivated early and does not check provider suspension", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockUsersSingle.mockResolvedValue({
      data: {
        deactivated_at: "2025-01-01T00:00:00.000Z",
        deactivated_by: "admin",
        role: "provider_owner",
      },
      error: null,
    });
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/account-status"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.is_deactivated).toBe(true);
    expect(mockGetProviderIdForUser).not.toHaveBeenCalled();
  });

  it("returns is_suspended when provider org is suspended (owner)", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_owner });
    mockUsersSingle.mockResolvedValue({
      data: { deactivated_at: null, deactivated_by: null, role: "provider_owner" },
      error: null,
    });
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    mockProvidersMaybeSingle.mockResolvedValue({
      data: {
        id: "prov-1",
        status: "suspended",
        status_reason: "Payment overdue",
        updated_at: "2025-02-01T00:00:00.000Z",
      },
      error: null,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/account-status"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.is_suspended).toBe(true);
    expect(body.data.suspension_reason).toBe("Payment overdue");
    expect(body.data.provider_id).toBe("prov-1");
    expect(mockGetProviderIdForUser).toHaveBeenCalledWith(
      MOCK_USERS.provider_owner.id,
      expect.anything()
    );
  });

  it("returns is_suspended when provider org is suspended (staff)", async () => {
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.provider_staff });
    mockUsersSingle.mockResolvedValue({
      data: { deactivated_at: null, deactivated_by: null, role: "provider_staff" },
      error: null,
    });
    mockGetProviderIdForUser.mockResolvedValue("prov-2");
    mockProvidersMaybeSingle.mockResolvedValue({
      data: {
        id: "prov-2",
        status: "suspended",
        status_reason: null,
        updated_at: "2025-02-01T00:00:00.000Z",
      },
      error: null,
    });

    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/me/account-status"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.is_suspended).toBe(true);
    expect(String(body.data.suspension_reason)).toContain("suspended");
  });
});
