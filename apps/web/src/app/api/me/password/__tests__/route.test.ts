import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolvePublicAuthPolicyForTenant = vi.fn();
const mockGetUserAuthSecurityState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown) => NextResponse.json({ data }),
  handleApiError: (error: unknown) =>
    NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    ),
}));

vi.mock("@/lib/config/resolve-public-auth-policy", () => ({
  resolvePublicAuthPolicyForTenant: (...args: unknown[]) =>
    mockResolvePublicAuthPolicyForTenant(...args),
}));

vi.mock("@/lib/auth/user-auth-security-state", () => ({
  getUserAuthSecurityState: (...args: unknown[]) => mockGetUserAuthSecurityState(...args),
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("https://app.example.com/api/me/password", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/me/password", () => {
  const updateUser = vi.fn();
  const supabase = {
    auth: {
      getUser: vi.fn(),
      updateUser,
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user_1" } });
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user_1", email: "user@example.com", phone: "+27123456789" } },
    });
    updateUser.mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { preferred_home_tenant_id: "tenant_1", password_changed_at: null },
      }),
      update: vi.fn().mockReturnThis(),
    });
    mockGetSupabaseServer.mockResolvedValue(supabase);
    mockResolvePublicAuthPolicyForTenant.mockResolvedValue({
      minimum_password_length: 8,
      password_requirements: "none",
      require_current_password: true,
    });
    mockGetUserAuthSecurityState.mockResolvedValue({
      has_password: true,
      has_mailable_email: true,
      has_phone: true,
      email_is_placeholder: false,
      password_changed_at: null,
      policy: {},
    });
  });

  it("changes an existing password using Supabase current_password", async () => {
    const { PUT } = await import("../route");
    const res = await PUT(request({
      mode: "change",
      currentPassword: "old-password",
      newPassword: "new-password",
    }));

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({
      password: "new-password",
      current_password: "old-password",
    });
  });

  it("sets a first password with a reauthentication nonce", async () => {
    mockGetUserAuthSecurityState.mockResolvedValueOnce({
      has_password: false,
      has_mailable_email: true,
      has_phone: false,
      email_is_placeholder: false,
      password_changed_at: null,
      policy: {},
    });

    const { PUT } = await import("../route");
    const res = await PUT(request({
      mode: "set",
      nonce: "123456",
      newPassword: "new-password",
    }));

    expect(res.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({
      password: "new-password",
      nonce: "123456",
    });
  });

  it("rejects set-password when the account already has a password", async () => {
    const { PUT } = await import("../route");
    const res = await PUT(request({
      mode: "set",
      nonce: "123456",
      newPassword: "new-password",
    }));

    expect(res.status).toBe(409);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects passwords that do not satisfy platform policy", async () => {
    mockResolvePublicAuthPolicyForTenant.mockResolvedValueOnce({
      minimum_password_length: 12,
      password_requirements: "lowercase_uppercase_number",
      require_current_password: true,
    });

    const { PUT } = await import("../route");
    const res = await PUT(request({
      mode: "change",
      currentPassword: "old-password",
      newPassword: "short",
    }));

    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when newPassword is missing", async () => {
    const { PUT } = await import("../route");
    const res = await PUT(request({ mode: "change", currentPassword: "old" }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns 400 when set-mode is used without a nonce", async () => {
    mockGetUserAuthSecurityState.mockResolvedValueOnce({
      has_password: false,
      has_mailable_email: true,
      has_phone: false,
      email_is_placeholder: false,
      password_changed_at: null,
      policy: {},
    });
    const { PUT } = await import("../route");
    const res = await PUT(request({ mode: "set", newPassword: "new-password" }));
    expect(res.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns 401 when Supabase rejects an invalid current_password", async () => {
    updateUser.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    const { PUT } = await import("../route");
    const res = await PUT(request({
      mode: "change",
      currentPassword: "wrong-password",
      newPassword: "new-password",
    }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("incorrect");
  });

  it("returns 401 when Supabase rejects an invalid nonce", async () => {
    mockGetUserAuthSecurityState.mockResolvedValueOnce({
      has_password: false,
      has_mailable_email: true,
      has_phone: false,
      email_is_placeholder: false,
      password_changed_at: null,
      policy: {},
    });
    updateUser.mockResolvedValueOnce({ error: { message: "nonce expired or invalid" } });
    const { PUT } = await import("../route");
    const res = await PUT(request({ mode: "set", nonce: "000000", newPassword: "new-password" }));
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("invalid or expired");
  });
});
