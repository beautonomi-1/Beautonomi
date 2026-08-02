import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockCheckMessageLimit = vi.fn();
const mockInsertNotification = vi.fn();
const mockSendTemplateNotification = vi.fn();
const mockGetNotificationTemplate = vi.fn();

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  successResponse: (data: unknown, status = 200) =>
    Response.json({ data, error: null }, { status }),
  notFoundResponse: (message = "Not found") =>
    Response.json({ data: null, error: { message, code: "NOT_FOUND" } }, { status: 404 }),
  errorResponse: (message: string, code = "ERROR", status = 400) =>
    Response.json({ data: null, error: { message, code } }, { status }),
  handleApiError: (error: unknown, message = "Error", status = 500) =>
    Response.json(
      {
        data: null,
        error: { message, details: error instanceof Error ? error.message : String(error) },
      },
      { status },
    ),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/subscriptions/limit-checker", () => ({
  checkMessageLimit: (...args: unknown[]) => mockCheckMessageLimit(...args),
  formatLimitError: () => "Message limit reached",
}));

vi.mock("@/lib/notifications/insert-notification", () => ({
  insertNotification: (...args: unknown[]) => mockInsertNotification(...args),
}));

vi.mock("@/lib/notifications/onesignal", () => ({
  sendToUser: vi.fn(),
  sendTemplateNotification: (...args: unknown[]) => mockSendTemplateNotification(...args),
  getNotificationTemplate: (...args: unknown[]) => mockGetNotificationTemplate(...args),
}));

vi.mock("@/lib/safety/require-social-access", () => ({
  requireSocialAccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/safety/user-blocks", () => ({
  assertNotBlocked: vi.fn(async () => undefined),
  filterBlockedNotificationRecipients: vi.fn(async (_sender: string, ids: string[]) => ids),
  UserBlockedError: class UserBlockedError extends Error {
    code = "USER_BLOCKED";
  },
}));

function createQuery(result: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.single = vi.fn(async () => ({ data: result, error: null }));
  query.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  return query;
}

describe("POST /api/provider/conversations/[id]/messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({
      user: { id: "provider-user-1", role: "provider_owner", full_name: "Provider Owner" },
    });
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "provider-user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue("provider-1");
    mockGetSupabaseServer.mockResolvedValue({});
    mockCheckMessageLimit.mockResolvedValue({
      canProceed: true,
      limitValue: null,
      planName: "",
      currentCount: 0,
    });
    mockGetNotificationTemplate.mockResolvedValue({
      enabled: true,
      channels: ["push"],
    });
  });

  it("creates a customer in-app notification through the shared helper", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return createQuery({ id: "conversation-1", provider_id: "provider-1", customer_id: "customer-1" });
        }
        if (table === "messages") {
          return createQuery({
            id: "message-1",
            conversation_id: "conversation-1",
            sender_id: "provider-user-1",
            sender_role: "provider_owner",
            content: "Hello customer",
            created_at: "2026-04-29T09:00:00.000Z",
          });
        }
        if (table === "providers") {
          return createQuery({ business_name: "Glow Studio" });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/conversations/conversation-1/messages", {
      method: "POST",
      body: JSON.stringify({ content: "Hello customer" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "conversation-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("message-1");
    expect(mockInsertNotification).toHaveBeenCalledWith({
      user_id: "customer-1",
      type: "new_message",
      title: "New Message from Provider",
      message: "Hello customer",
      data: { conversation_id: "conversation-1", message_id: "message-1" },
      action_url: "/account-settings/messages?conversation=conversation-1",
    });
  });

  it("rejects reply_to_message_id when parent is not in the conversation", async () => {
    const parentId = "550e8400-e29b-41d4-a716-446655440000";
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return createQuery({ id: "conversation-1", provider_id: "provider-1", customer_id: "customer-1" });
        }
        if (table === "messages") {
          return createQuery(null);
        }
        if (table === "providers") {
          return createQuery({ business_name: "Glow Studio" });
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/conversations/conversation-1/messages", {
      method: "POST",
      body: JSON.stringify({ content: "A reply", reply_to_message_id: parentId }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "conversation-1" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.message).toContain("Reply target");
  });
});
