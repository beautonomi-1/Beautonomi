import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockRegisterDevice = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
}));

describe("POST /api/provider/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-1" } });
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn() });
    mockRegisterDevice.mockResolvedValue({ success: true });
  });

  it("registers provider devices against the provider app type", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/provider/devices", {
      method: "POST",
      body: JSON.stringify({
        player_id: "sub-provider-1",
        platform: "ios",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ registered: true });
    expect(mockRequireRoleInApi).toHaveBeenCalledWith(
      ["provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request,
    );
    expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.anything(),
      "provider-user-1",
      "sub-provider-1",
      "ios",
      "provider",
    );
  });

  it("does not report success when provider device registration fails", async () => {
    mockRegisterDevice.mockResolvedValue({ success: false, error: "duplicate device conflict" });

    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/provider/devices", {
      method: "POST",
      body: JSON.stringify({
        player_id: "sub-provider-1",
        platform: "android",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("DEVICE_REGISTRATION_FAILED");
    expect(body.error?.message).toContain("duplicate device conflict");
  });
});
