import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockUserHasProviderAccessAdmin = vi.fn();
const mockResolveSupportTicketStaffRecipients = vi.fn();
const mockNotifySupportStaffInboxActivity = vi.fn();
const mockSlackNotifySupportTicketReply = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    userHasProviderAccessAdmin: (...args: unknown[]) => mockUserHasProviderAccessAdmin(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  resolveSupportTicketStaffRecipients: (...args: unknown[]) =>
    mockResolveSupportTicketStaffRecipients(...args),
  notifySupportStaffInboxActivity: (...args: unknown[]) =>
    mockNotifySupportStaffInboxActivity(...args),
}));

vi.mock("@/lib/integrations/slack/triggers", () => ({
  slackNotifySupportTicketReply: (...args: unknown[]) => mockSlackNotifySupportTicketReply(...args),
}));

function createSupabase(ticketStatus = "open") {
  const updatePayloads: Record<string, unknown>[] = [];
  return {
    updatePayloads,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: "ticket-1",
                    provider_id: "provider-1",
                    requester_type: "provider",
                    ticket_number: "SUP-1",
                    subject: "Help",
                    assigned_to: null,
                    status: ticketStatus,
                  },
                  error: null,
                })),
              })),
            })),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatePayloads.push(payload);
              return { eq: vi.fn(async () => ({ error: null })) };
            }),
          };
        }
        if (table === "support_ticket_messages") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "message-1",
                    ticket_id: "ticket-1",
                    user_id: "provider-user-2",
                    message: "Thanks",
                    created_at: "2026-05-01T10:10:00.000Z",
                    attachments: [],
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    },
  };
}

describe("POST /api/provider/support-tickets/[id]/messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-2", role: "provider_staff" } });
    mockUserHasProviderAccessAdmin.mockResolvedValue(true);
    mockResolveSupportTicketStaffRecipients.mockResolvedValue([]);
    mockNotifySupportStaffInboxActivity.mockResolvedValue(undefined);
    mockSlackNotifySupportTicketReply.mockResolvedValue(undefined);
  });

  it("allows an authorized provider teammate to reply to an existing provider ticket", async () => {
    const mock = createSupabase();
    mockGetSupabaseAdmin.mockReturnValue(mock.supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/support-tickets/ticket-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "Thanks" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatchObject({
      id: "message-1",
      message: "Thanks",
      is_mine: true,
      author_name: "You",
    });
    expect(mock.updatePayloads[0]).toMatchObject({
      last_message_from: "customer",
      last_customer_view_at: "2026-05-01T10:10:00.000Z",
      last_message_at: "2026-05-01T10:10:00.000Z",
    });
  });

  it("blocks replies from unrelated provider users", async () => {
    const mock = createSupabase();
    mockGetSupabaseAdmin.mockReturnValue(mock.supabase);
    mockUserHasProviderAccessAdmin.mockResolvedValue(false);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/support-tickets/ticket-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "Thanks" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mock.updatePayloads).toHaveLength(0);
  });
});
