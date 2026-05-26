import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockUserHasProviderAccessAdmin = vi.fn();

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

function createSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: "ticket-1",
                  ticket_number: "SUP-1",
                  provider_id: "provider-1",
                  requester_type: "provider",
                  subject: "Help",
                  status: "open",
                },
                error: null,
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
                order: vi.fn(async () => ({
                  data: [
                    {
                      id: "message-1",
                      message: "Original issue",
                      is_internal: false,
                      created_at: "2026-05-01T10:00:00.000Z",
                      user_id: "creator-1",
                      attachments: [],
                      author: { display_name: "Provider Owner" },
                    },
                    {
                      id: "message-2",
                      message: "Support response",
                      is_internal: false,
                      created_at: "2026-05-01T10:05:00.000Z",
                      user_id: "support-1",
                      attachments: [],
                      author: { display_name: "Support Agent" },
                    },
                  ],
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("GET /api/provider/support-tickets/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "provider-user-2", role: "provider_staff" } });
    mockUserHasProviderAccessAdmin.mockResolvedValue(true);
  });

  it("returns the full visible provider ticket thread for an authorized provider user", async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabase());

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.ticket.id).toBe("ticket-1");
    expect(body.data.messages).toHaveLength(2);
    expect(body.data.messages.map((m: { message: string }) => m.message)).toEqual([
      "Original issue",
      "Support response",
    ]);
    expect(body.data.messages[1]).toMatchObject({
      author_name: "Support Agent",
      is_mine: false,
    });
  });

  it("blocks provider users without access to the ticket provider", async () => {
    mockGetSupabaseAdmin.mockReturnValue(createSupabase());
    mockUserHasProviderAccessAdmin.mockResolvedValue(false);

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
