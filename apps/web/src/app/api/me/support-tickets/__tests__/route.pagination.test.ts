import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();

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
  getSupabaseAdmin: vi.fn(),
}));

class SupportTicketsQuery {
  select = vi.fn(() => this);
  eq = vi.fn(() => this);
  order = vi.fn(() => this);
  range = vi.fn(async () => ({
    data: [{
      id: "ticket-1",
      ticket_number: "SUP-1",
      subject: "Help",
      last_message_from: "staff",
      last_message_at: "2026-05-11T10:00:00.000Z",
      last_customer_view_at: "2026-05-11T09:00:00.000Z",
    }],
    error: null,
    count: 140,
  }));
}

describe("GET /api/me/support-tickets pagination", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "customer-1", role: "customer" } });
  });

  it("clamps oversized limits and returns real total metadata", async () => {
    const query = new SupportTicketsQuery();
    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => query),
    });

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/me/support-tickets?limit=500&offset=50");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(query.range).toHaveBeenCalledWith(50, 149);
    expect(body.data.tickets).toHaveLength(1);
    expect(body.data.tickets[0].has_unread_staff_reply).toBe(true);
    expect(body.data.total).toBe(140);
    expect(body.data.pagination).toEqual({ limit: 100, offset: 50, has_more: false });
  });
});
