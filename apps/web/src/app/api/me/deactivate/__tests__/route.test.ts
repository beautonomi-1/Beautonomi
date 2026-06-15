import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveAuthSecurityForUser = vi.fn();
const mockValidateSensitiveActionCredentials = vi.fn();
const mockVerifySensitiveActionForUser = vi.fn();
const mockWriteAuditLog = vi.fn();
const mockExtractRequestMeta = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  successResponse: (data: unknown) => Response.json({ data, error: null }),
  handleApiError: (error: unknown) =>
    Response.json(
      { data: null, error: { message: error instanceof Error ? error.message : "Failed" } },
      { status: 500 },
    ),
}));

vi.mock("@/lib/auth/validate-sensitive-action-input", () => ({
  parseSensitiveActionCredentials: (body: Record<string, unknown>) => ({
    password: typeof body.password === "string" ? body.password.trim() : "",
    verificationNonce:
      typeof body.verificationNonce === "string" ? body.verificationNonce.trim() : "",
  }),
  resolveAuthSecurityForUser: (...args: unknown[]) => mockResolveAuthSecurityForUser(...args),
  validateSensitiveActionCredentials: (...args: unknown[]) =>
    mockValidateSensitiveActionCredentials(...args),
}));

vi.mock("@/lib/auth/verify-sensitive-action", () => ({
  verifySensitiveActionForUser: (...args: unknown[]) => mockVerifySensitiveActionForUser(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  extractRequestMeta: (...args: unknown[]) => mockExtractRequestMeta(...args),
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("https://app.example.com/api/me/deactivate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "Vitest",
    },
  });
}

describe("POST /api/me/deactivate", () => {
  const signOut = vi.fn();
  const usersUpdate = vi.fn();
  const supabase = {
    auth: {
      getUser: vi.fn(),
      signOut,
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user_1", role: "customer" },
    });
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user_1", email: "user@example.com" } },
    });
    signOut.mockResolvedValue({});
    usersUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    supabase.from.mockReturnValue({ update: usersUpdate });
    mockGetSupabaseServer.mockResolvedValue(supabase);
    mockResolveAuthSecurityForUser.mockResolvedValue({
      has_password: true,
      has_mailable_email: true,
      has_phone: false,
    });
    mockValidateSensitiveActionCredentials.mockReturnValue({ ok: true });
    mockVerifySensitiveActionForUser.mockResolvedValue(true);
    mockExtractRequestMeta.mockReturnValue({
      ip_address: "203.0.113.10",
      user_agent: "Vitest",
    });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("writes an audit log on successful deactivation", async () => {
    const { POST } = await import("../route");
    const res = await POST(request({ password: "correct-password", reason: "Taking a break" }));

    expect(res.status).toBe(200);
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: "user_1",
        actor_role: "customer",
        action: "user.account.self_service_deactivate",
        entity_type: "user",
        entity_id: "user_1",
        status: "succeeded",
        reason: "Taking a break",
        metadata: { deactivated_by: "user" },
        ip_address: "203.0.113.10",
        user_agent: "Vitest",
      }),
    );
  });
});
