import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

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
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

/** Service-role lookup that maps message user_ids to display names. */
function createAdminUsersClient(rows: { id: string; full_name: string | null }[] = [
  { id: "support-1", full_name: "Support Agent" },
]) {
  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: rows, error: null })),
          })),
        };
      }
      throw new Error(`Unexpected admin table ${table}`);
    }),
  };
}

function createSupabase(options?: { messages?: unknown[]; description?: string }) {
  const messages = options?.messages ?? [
    {
      id: "message-1",
      message: "Need help with payouts",
      is_internal: false,
      created_at: "2026-05-01T10:00:00.000Z",
      user_id: "provider-user-1",
      attachments: [],
    },
    {
      id: "message-2",
      message: "We are looking into this",
      is_internal: false,
      created_at: "2026-05-01T10:05:00.000Z",
      user_id: "support-1",
      attachments: [],
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "ticket-1",
                    ticket_number: "TKT-20260501-000001",
                    subject: "Payout issue",
                    description: options?.description ?? "Need help with payouts",
                    user_id: "provider-user-1",
                    status: "open",
                    priority: "medium",
                    category: null,
                    requester_type: "provider",
                    support_context_type: null,
                    support_context_id: null,
                    support_context_label: null,
                    csat_score: null,
                    csat_comment: null,
                    csat_submitted_at: null,
                    last_message_at: "2026-05-01T10:05:00.000Z",
                    last_message_from: "staff",
                    last_customer_view_at: null,
                    created_at: "2026-05-01T10:00:00.000Z",
                    updated_at: "2026-05-01T10:05:00.000Z",
                  },
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === "support_ticket_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: messages, error: null })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("GET /api/me/support-tickets/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-1", role: "provider_owner" } });
    mockGetSupabaseAdmin.mockReturnValue(createAdminUsersClient());
  });

  it("returns the full visible thread for the ticket owner", async () => {
    mockGetSupabaseServer.mockResolvedValue(createSupabase());

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ticket.id).toBe("ticket-1");
    expect(body.data.ticket.description).toBeUndefined();
    expect(body.data.messages).toHaveLength(2);
    expect(body.data.messages[0]).toMatchObject({ message: "Need help with payouts", is_mine: true });
    expect(body.data.messages[1]).toMatchObject({
      message: "We are looking into this",
      author_name: "Support Agent",
      is_mine: false,
    });
  });

  it("selects messages without a fragile users embed (owner RLS cannot read staff rows)", async () => {
    const messageSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "support_tickets") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: "ticket-1", description: "", user_id: "provider-user-1" },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }
        return { select: messageSelect };
      }),
    };
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1");
    await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });

    const selectArg = String(messageSelect.mock.calls[0]?.[0] ?? "");
    expect(selectArg).not.toContain("author:users");
    expect(selectArg).not.toContain("profiles");
    expect(selectArg).toContain("user_id");
  });

  it("resolves staff author names through the service-role client", async () => {
    mockGetSupabaseServer.mockResolvedValue(createSupabase());
    mockGetSupabaseAdmin.mockReturnValue(
      createAdminUsersClient([{ id: "support-1", full_name: "Nadia from Support" }]),
    );

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.messages[1]).toMatchObject({
      author_name: "Nadia from Support",
      is_mine: false,
    });
  });

  it("prepends legacy description when no message rows exist", async () => {
    mockGetSupabaseServer.mockResolvedValue(
      createSupabase({ messages: [], description: "Legacy ticket body only" }),
    );

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.messages[0]).toMatchObject({
      id: "ticket-description-ticket-1",
      message: "Legacy ticket body only",
      is_mine: true,
      is_ticket_description: true,
    });
  });
});
