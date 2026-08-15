import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAuthInApi = vi.fn();
const mockFrom = vi.fn();
const mockSync = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/auth/effective-provider-role", () => ({
  syncPortalRoleAfterWorkplaceChange: (...args: unknown[]) => mockSync(...args),
}));

describe("POST /api/provider/memberships/leave", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("deactivates staff membership and heals role when no workplace remains", async () => {
    mockSync.mockResolvedValue("provider_onboarding");
    mockFrom.mockImplementation((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        };
      }
      if (table === "provider_staff") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [] }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "staff-1" },
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/memberships/leave", {
      method: "POST",
      body: JSON.stringify({ provider_id: "11111111-1111-4111-8111-111111111111" }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json?.data?.role).toBe("provider_onboarding");
    expect(json?.data?.active_provider_id).toBeNull();
    expect(mockSync).toHaveBeenCalledWith("user-1");
  });

  it("forbids leaving a business the user owns", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "11111111-1111-4111-8111-111111111111" } }),
        };
      }
      return {};
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/memberships/leave", {
      method: "POST",
      body: JSON.stringify({ provider_id: "11111111-1111-4111-8111-111111111111" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("pins the remaining workplace after leaving one team", async () => {
    mockSync.mockResolvedValue("provider_staff");
    let staffSelectCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "providers") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        };
      }
      if (table === "provider_staff") {
        staffSelectCount += 1;
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ provider_id: "22222222-2222-4222-8222-222222222222" }],
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: staffSelectCount === 1 ? { id: "staff-1" } : null,
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {};
    });

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/memberships/leave", {
      method: "POST",
      body: JSON.stringify({ provider_id: "11111111-1111-4111-8111-111111111111" }),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json?.data?.role).toBe("provider_staff");
    expect(json?.data?.active_provider_id).toBe("22222222-2222-4222-8222-222222222222");
  });
});
