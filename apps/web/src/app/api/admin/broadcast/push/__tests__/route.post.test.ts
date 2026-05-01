import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { POST } from "../route";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireAdminSection: vi.fn(),
  };
});

vi.mock("@/lib/tenant/admin-request-tenant", () => ({
  resolveAdminApiTenantId: vi.fn().mockResolvedValue("tenant-1"),
}));

vi.mock("@/lib/platform/secrets", () => ({
  resolveOneSignalCredentials: vi.fn().mockResolvedValue({ appId: "app-1", restKey: "key-1" }),
  validateOneSignalCredentialPair: vi.fn().mockReturnValue({ ok: true }),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUsers: vi.fn().mockResolvedValue({ success: true, notification_id: "notif-1" }),
}));

vi.mock("@/lib/audit/audit", () => ({
  extractRequestMeta: vi.fn().mockReturnValue({ ip_address: "127.0.0.1", user_agent: "vitest" }),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const adminUser = { ...MOCK_USERS.superadmin, role: "superadmin" };
const customUserId = "550e8400-e29b-41d4-a716-446655440000";

function createSupabaseMock() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}

describe("POST /api/admin/broadcast/push", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAdminSection } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(requireAdminSection).mockResolvedValue({ user: adminUser } as any);
    vi.mocked(getSupabaseServer).mockResolvedValue(createSupabaseMock() as any);
  });

  it("requires an explicit app_type for custom push recipients", async () => {
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        body: {
          title: "Hello",
          message: "World",
          recipient_type: "custom",
          user_ids: [customUserId],
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(body.error?.details?.fieldErrors?.app_type).toBeTruthy();
  });

  it("passes custom app_type and tenantId into OneSignal helpers", async () => {
    const response = await POST(
      createMockNextRequest({
        method: "POST",
        body: {
          title: "Provider alert",
          message: "Heads up",
          recipient_type: "custom",
          user_ids: [customUserId],
          app_type: "provider",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    const { resolveOneSignalCredentials, validateOneSignalCredentialPair } = await import("@/lib/platform/secrets");
    const { sendToUsers } = await import("@/lib/notifications/onesignal");
    expect(resolveOneSignalCredentials).toHaveBeenCalledWith("provider", { tenantId: "tenant-1" });
    expect(validateOneSignalCredentialPair).toHaveBeenCalledWith(
      expect.objectContaining({ appType: "provider" }),
    );
    expect(sendToUsers).toHaveBeenCalledWith(
      [customUserId],
      expect.objectContaining({ title: "Provider alert" }),
      ["push"],
      { appType: "provider", tenantId: "tenant-1" },
    );
  });
});
