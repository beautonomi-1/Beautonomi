import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockRegisterDevice = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
}));

describe("POST /api/me/devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetSupabaseServer.mockResolvedValue({ from: vi.fn() });
    mockRegisterDevice.mockResolvedValue({ success: true });
  });

  it("registers customer devices server-side even if the client sends app_type", async () => {
    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/devices", {
      method: "POST",
      body: JSON.stringify({
        player_id: "sub-1",
        platform: "ios",
        app_type: "provider",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ registered: true });
    expect(mockRequireRoleInApi).toHaveBeenCalledWith(
      ["customer", "provider_owner", "provider_staff", "provider_onboarding", "superadmin"],
      request
    );
    expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "sub-1",
      "ios",
      "customer"
    );
  });

  it("returns an error when the device row cannot be saved", async () => {
    mockRegisterDevice.mockResolvedValue({ success: false, error: "RLS denied" });

    const { POST } = await import("../route");
    const request = new NextRequest("http://localhost/api/me/devices", {
      method: "POST",
      body: JSON.stringify({
        player_id: "sub-1",
        platform: "android",
        app_type: "provider",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error?.code).toBe("DEVICE_REGISTRATION_FAILED");
    expect(body.error?.message).toContain("RLS denied");
  });
});
