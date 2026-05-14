import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockNotifySupportTicketUpdated = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/notifications/notification-service", () => ({
  notifySupportTicketUpdated: (...args: unknown[]) => mockNotifySupportTicketUpdated(...args),
}));

describe("POST /api/admin/support-tickets/[id]/messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "staff-1", role: "support_agent" } });
    mockNotifySupportTicketUpdated.mockResolvedValue(undefined);
  });

  it("records public staff replies as the latest staff message", async () => {
    const updatePayloads: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    user_id: "customer-1",
                    provider_id: null,
                    ticket_number: "SUP-1",
                    subject: "Help",
                    first_staff_reply_at: null,
                    status: "open",
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
                  data: { id: "message-1", message: "We fixed it", created_at: "2026-05-11T10:00:00.000Z" },
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseAdmin.mockReturnValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets/ticket-1/messages", {
      method: "POST",
      body: JSON.stringify({ message: "We fixed it", is_internal: false }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "ticket-1" }) });

    expect(res.status).toBe(200);
    expect(updatePayloads[0]).toMatchObject({
      last_message_at: "2026-05-11T10:00:00.000Z",
      last_message_from: "staff",
      first_staff_reply_at: expect.any(String),
      status: "in_progress",
    });
  });
});
