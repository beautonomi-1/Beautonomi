import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockPurgePlatformUserAccountFully = vi.fn();
const mockResolveAuthSecurityForUser = vi.fn();
const mockValidateSensitiveActionCredentials = vi.fn();
const mockVerifySensitiveActionForUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
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

vi.mock("@/lib/account/purge-platform-user", () => ({
  purgePlatformUserAccountFully: (...args: unknown[]) => mockPurgePlatformUserAccountFully(...args),
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

const mockLoadSelfServiceDeletionContext = vi.fn();
const mockNotifyOpsSelfServiceAccountDeletion = vi.fn();
const mockScheduleAccountDeletion = vi.fn();
const mockIsAccountDeletionGraceEnabled = vi.fn();
const mockWriteAuditLog = vi.fn();

vi.mock("@/lib/account/notify-ops-self-service-account-deletion", () => ({
  loadSelfServiceDeletionContext: (...args: unknown[]) => mockLoadSelfServiceDeletionContext(...args),
  notifyOpsSelfServiceAccountDeletion: (...args: unknown[]) =>
    mockNotifyOpsSelfServiceAccountDeletion(...args),
}));

vi.mock("@/lib/account/account-deletion-config", () => ({
  isAccountDeletionGraceEnabled: () => mockIsAccountDeletionGraceEnabled(),
  ACCOUNT_DELETION_GRACE_DAYS: 30,
}));

vi.mock("@/lib/account/schedule-account-deletion", () => ({
  scheduleAccountDeletion: (...args: unknown[]) => mockScheduleAccountDeletion(...args),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  extractRequestMeta: () => ({ ip_address: "127.0.0.1", user_agent: "test" }),
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("https://app.example.com/api/me/delete-account", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/me/delete-account", () => {
  const signOut = vi.fn();
  const usersUpdate = vi.fn();
  const supabase = {
    auth: {
      getUser: vi.fn(),
      signOut,
    },
  };
  const admin = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "user_1", role: "provider_owner" },
    });
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user_1", email: "owner@example.com" } },
    });
    signOut.mockResolvedValue({});
    mockGetSupabaseServer.mockResolvedValue(supabase);
    usersUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    admin.from.mockReturnValue({ update: usersUpdate });
    mockGetSupabaseAdmin.mockReturnValue(admin);
    mockResolveAuthSecurityForUser.mockResolvedValue({
      has_password: false,
      has_mailable_email: true,
      has_phone: true,
    });
    mockValidateSensitiveActionCredentials.mockReturnValue({ ok: true });
    mockVerifySensitiveActionForUser.mockResolvedValue(true);
    mockPurgePlatformUserAccountFully.mockResolvedValue({ ok: true, storage_attachments_removed: 0 });
    mockLoadSelfServiceDeletionContext.mockResolvedValue({
      userId: "user_1",
      role: "provider_owner",
      email: "owner@example.com",
      tenantId: "tenant_1",
      providerId: "prov_1",
      snapshot: null,
    });
    mockNotifyOpsSelfServiceAccountDeletion.mockResolvedValue(undefined);
    mockIsAccountDeletionGraceEnabled.mockReturnValue(false);
    mockScheduleAccountDeletion.mockResolvedValue({
      ok: true,
      purge_after_at: "2026-07-18T00:00:00.000Z",
      cancel_url: "https://example.com/cancel",
    });
    mockWriteAuditLog.mockResolvedValue(undefined);
  });

  it("purges account when pre-update stamp fails (non-blocking)", async () => {
    usersUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({
        error: { code: "42703", message: 'column "account_deletion_requested_at" does not exist' },
      }),
    });

    const { POST } = await import("../route");
    const res = await POST(
      request({ verificationNonce: "123456", reason: "Leaving" }),
    );

    expect(res.status).toBe(200);
    expect(mockPurgePlatformUserAccountFully).toHaveBeenCalledWith(admin, "user_1");
    expect(signOut).toHaveBeenCalled();
    expect(mockNotifyOpsSelfServiceAccountDeletion).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ outcome: "succeeded", context: expect.objectContaining({ userId: "user_1" }) }),
    );
  });

  it("returns DELETION_PURGE_FAILED when purge RPC fails", async () => {
    mockPurgePlatformUserAccountFully.mockResolvedValueOnce({
      ok: false,
      message: "Could not clear provider purge FK blocker",
      code: "23503",
    });

    const { POST } = await import("../route");
    const res = await POST(request({ verificationNonce: "123456" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("23503");
    expect(json.error).toContain("Could not clear provider purge");
    expect(mockNotifyOpsSelfServiceAccountDeletion).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ outcome: "failed", failureCode: "23503" }),
    );
  });

  it("maps auth database delete failures to support message", async () => {
    mockPurgePlatformUserAccountFully.mockResolvedValueOnce({
      ok: false,
      message: "Database error deleting user",
      code: "AUTH_DELETE_DATABASE_ERROR",
    });

    const { POST } = await import("../route");
    const res = await POST(request({ password: "secret" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("AUTH_DELETE_DATABASE_ERROR");
    expect(json.error).toContain("related records are still linked");
    expect(json.error).not.toContain("notified");
  });

  it("rejects invalid verification", async () => {
    mockVerifySensitiveActionForUser.mockResolvedValueOnce(false);

    const { POST } = await import("../route");
    const res = await POST(request({ verificationNonce: "000000" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("VERIFICATION_FAILED");
    expect(mockPurgePlatformUserAccountFully).not.toHaveBeenCalled();
  });

  it("schedules deletion when grace period is enabled", async () => {
    mockIsAccountDeletionGraceEnabled.mockReturnValue(true);

    const { POST } = await import("../route");
    const res = await POST(request({ verificationNonce: "123456", reason: "Leaving" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.scheduled).toBe(true);
    expect(json.data.grace_days).toBe(30);
    expect(mockScheduleAccountDeletion).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ userId: "user_1", email: "owner@example.com" }),
    );
    expect(mockPurgePlatformUserAccountFully).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.account.deletion_scheduled" }),
    );
  });
});
