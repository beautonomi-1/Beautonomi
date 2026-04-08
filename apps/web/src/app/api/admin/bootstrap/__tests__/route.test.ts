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

describe("GET /api/admin/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });
  });

  it("returns 401 when requireRoleInApi throws Authentication required", async () => {
    mockRequireRoleInApi.mockRejectedValue(new Error("Authentication required"));
    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/bootstrap");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
