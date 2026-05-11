import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockResolveSupportTicketStaffRecipients = vi.fn();
const mockNotifySupportStaffInboxActivity = vi.fn();

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

vi.mock("@/lib/notifications/notification-service", () => ({
  resolveSupportTicketStaffRecipients: (...args: unknown[]) =>
    mockResolveSupportTicketStaffRecipients(...args),
  notifySupportStaffInboxActivity: (...args: unknown[]) =>
    mockNotifySupportStaffInboxActivity(...args),
}));

function createSupabase(ticketStatus: string) {
  const updatePayloads: Record<string, unknown>[] = [];
  return {
    updatePayloads,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "ticket-1",
                    user_id: "customer-1",
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
                  data: { id: "message-1", message: "Thanks" },
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

describe("POST /api/me/support-tickets/[id]/messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
    mockResolveSupportTicketStaffRecipients.mockResolvedValue([]);
    mockNotifySupportStaffInboxActivity.mockResolvedValue(undefined);
  });

  it("moves waiting_customer tickets back to support when the customer replies", async () => {
    const mock = createSupabase("waiting_customer");
    mockGetSupabaseServer.mockResolvedValue(mock.supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "Thanks" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });

    expect(res.status).toBe(200);
    expect(mock.updatePayloads[0]).toMatchObject({
      status: "in_progress",
      last_message_from: "customer",
      last_customer_view_at: expect.any(String),
      last_message_at: expect.any(String),
    });
  });

  it("rejects replies to closed tickets", async () => {
    const mock = createSupabase("closed");
    mockGetSupabaseServer.mockResolvedValue(mock.supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "Still need help" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("TICKET_CLOSED");
    expect(mock.updatePayloads).toHaveLength(0);
  });
});
