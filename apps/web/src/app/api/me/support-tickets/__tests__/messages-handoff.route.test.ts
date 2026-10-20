import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockNotifySupportStaffInboxActivity = vi.fn();
const mockPrecheck = vi.fn();
const mockRunTurn = vi.fn();

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

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  resolveSupportTicketStaffRecipients: vi.fn().mockResolvedValue(["staff-1"]),
  notifySupportStaffInboxActivity: (...args: unknown[]) => mockNotifySupportStaffInboxActivity(...args),
}));

vi.mock("@/lib/integrations/slack/triggers", () => ({
  slackNotifySupportTicketReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/support/support-assistant/run-turn", () => ({
  runSupportAssistantTurn: (...args: unknown[]) => mockRunTurn(...args),
}));

vi.mock("@/lib/support/support-assistant/turn-precheck", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/support/support-assistant/turn-precheck")>();
  return {
    ...actual,
    precheckSupportAssistantTurn: (...args: unknown[]) => mockPrecheck(...args),
  };
});

const TICKET_ID = "11111111-1111-4111-8111-111111111111";

function buildRlsClient(inserted: Record<string, unknown>[]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: TICKET_ID,
              user_id: "user-1",
              ticket_number: "ST-1",
              subject: "Help",
              priority: "medium",
              assigned_to: null,
              status: "open",
              requester_type: "customer",
              handling_mode: "assistant",
            },
            error: null,
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === "support_ticket_messages") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserted.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "msg-1", created_at: "2026-01-01T12:00:00.000Z", ...row },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      return {};
    }),
  };
}

describe("POST /api/me/support-tickets/[id]/messages handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1", role: "customer" } });
    mockGetSupabaseAdmin.mockReturnValue({});
    mockNotifySupportStaffInboxActivity.mockResolvedValue(undefined);
  });

  it("saves the customer message as a human reply when precheck hands off", async () => {
    const inserted: Record<string, unknown>[] = [];
    mockGetSupabaseServer.mockResolvedValue(buildRlsClient(inserted));
    mockPrecheck.mockResolvedValue({
      ok: false,
      result: { ok: false, code: "ASSISTANT_DISABLED", message: "Connecting you to support.", handoff: true },
    });

    const { POST } = await import("../[id]/messages/route");
    const req = new NextRequest(`http://localhost/api/me/support-tickets/${TICKET_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "My refund has not arrived" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: TICKET_ID }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.handoff).toBe(true);
    expect(json.data?.message?.message).toBe("My refund has not arrived");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      ticket_id: TICKET_ID,
      message: "My refund has not arrived",
      author_kind: "customer",
      is_internal: false,
    });
    expect(mockRunTurn).not.toHaveBeenCalled();
    expect(mockNotifySupportStaffInboxActivity).toHaveBeenCalledTimes(1);
  });

  it("returns the failure without saving when precheck fails without handoff", async () => {
    const inserted: Record<string, unknown>[] = [];
    mockGetSupabaseServer.mockResolvedValue(buildRlsClient(inserted));
    mockPrecheck.mockResolvedValue({
      ok: false,
      result: { ok: false, code: "IN_FLIGHT", message: "Please wait for the current reply." },
    });

    const { POST } = await import("../[id]/messages/route");
    const req = new NextRequest(`http://localhost/api/me/support-tickets/${TICKET_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: "Hello?" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: TICKET_ID }) });
    expect(res.status).toBe(429);
    expect(inserted).toHaveLength(0);
  });
});
