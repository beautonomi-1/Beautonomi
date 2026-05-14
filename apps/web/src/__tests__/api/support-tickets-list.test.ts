import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

type QueryResult = {
  data: unknown[];
  error: null | Error;
  count: number | null;
};

function createQueryBuilder(result: QueryResult) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(
      JSON.stringify({
        data: null,
        error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` },
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    ),
}));

describe("GET /api/admin/support-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("applies filters, pagination, and sanitizes q for PostgREST .or()", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: {
        status: "open",
        priority: "high",
        category: "booking_issue",
        assigned_to: "unassigned",
        user_id: "user-123",
        q: "ab,c%_\\123",
        limit: "20",
        offset: "40",
      },
    });

    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);

    expect(builder.eq).toHaveBeenCalledWith("status", "open");
    expect(builder.eq).toHaveBeenCalledWith("priority", "high");
    expect(builder.eq).toHaveBeenCalledWith("category", "booking_issue");
    expect(builder.is).toHaveBeenCalledWith("assigned_to", null);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(builder.or).toHaveBeenCalledWith(
      "subject.ilike.%abc123%,ticket_number.ilike.%abc123%,description.ilike.%abc123%"
    );
    expect(builder.range).toHaveBeenCalledWith(40, 59);
  });

  it("returns tickets and total from count query", async () => {
    const rows = [
      { id: "t1", ticket_number: "SUP-1", subject: "Help", status: "open", priority: "medium" },
      { id: "t2", ticket_number: "SUP-2", subject: "Issue", status: "open", priority: "high" },
    ];
    const result: QueryResult = { data: rows, error: null, count: 53 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { limit: "25", offset: "25" },
    });

    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tickets).toEqual(rows);
    expect(body.total).toBe(53);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(25);
  });
});
