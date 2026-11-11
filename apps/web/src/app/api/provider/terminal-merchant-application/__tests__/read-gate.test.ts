import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: vi.fn(async () => "provider-1"),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

describe("GET /api/provider/terminal-merchant-application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockImplementation(async (roles: string[]) => {
      if (roles.includes("provider_staff")) {
        return { user: { id: "staff-user", role: "provider_staff" } };
      }
      throw new Error("Insufficient role");
    });
  });

  it("does not load the ID number or bank details for a staff member", async () => {
    const { GET } = await import("../route");
    const res = await GET(new NextRequest("http://localhost/api/provider/terminal-merchant-application"));
    expect(mockRequireRoleInApi).toHaveBeenCalledWith(
      ["provider_owner", "superadmin"],
      expect.anything(),
    );
    expect(res.status).not.toBe(200);
    expect(mockGetSupabaseServer).not.toHaveBeenCalled();
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
