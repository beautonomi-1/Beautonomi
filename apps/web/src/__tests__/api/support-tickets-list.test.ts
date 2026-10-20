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
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
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
      "subject.ilike.%abc123%,ticket_number.ilike.%abc123%,description.ilike.%abc123%,support_context_label.ilike.%abc123%,requester_email.ilike.%abc123%"
    );
    expect(builder.range).toHaveBeenCalledWith(40, 59);
  });

  it("also matches a UUID query to support_context_id", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue(builder),
    });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const uuid = "11111111-1111-4111-8111-111111111111";
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { q: uuid },
    });

    await GET(req as NextRequest);
    expect(builder.or).toHaveBeenCalledWith(
      `subject.ilike.%${uuid}%,ticket_number.ilike.%${uuid}%,description.ilike.%${uuid}%,support_context_label.ilike.%${uuid}%,requester_email.ilike.%${uuid}%,support_context_id.eq.${uuid}`
    );
  });

  it("returns tickets enriched with attention fields and total from count query", async () => {
    const rows = [
      { id: "t1", ticket_number: "SUP-1", subject: "Help", status: "open", priority: "medium", last_message_from: "customer" },
      { id: "t2", ticket_number: "SUP-2", subject: "Issue", status: "open", priority: "high", last_message_from: "staff" },
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

    // Each ticket now has server-computed attention fields.
    expect(body.tickets).toHaveLength(2);
    expect(body.tickets[0]).toMatchObject({ id: "t1", attention_state: expect.any(String), sla_state: expect.any(String), agent_unread: expect.any(Boolean) });
    expect(body.total).toBe(53);
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(25);
  });

  it("applies smart sort (four chained order calls) by default", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: {},
    });

    await GET(req as NextRequest);
    // Smart sort = 4 order() calls
    expect(builder.order).toHaveBeenCalledWith("needs_agent_response", { ascending: false });
    expect(builder.order).toHaveBeenCalledWith("priority_rank", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("sla_resolution_due_at", { ascending: true, nullsFirst: false });
    expect(builder.order).toHaveBeenCalledWith("last_message_at", { ascending: true, nullsFirst: false });
  });

  it("applies needs_response filter", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { needs_response: "1" },
    });

    await GET(req as NextRequest);
    expect(builder.eq).toHaveBeenCalledWith("needs_agent_response", true);
  });

  it("applies first_response_overdue filter", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { first_response_overdue: "1" },
    });

    await GET(req as NextRequest);
    expect(builder.lt).toHaveBeenCalledWith("first_response_due_at", expect.any(String));
    expect(builder.is).toHaveBeenCalledWith("first_staff_reply_at", null);
  });

  it("filters by category_group id or legacy English label", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const reqById = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { category_group: "bookings" },
    });
    await GET(reqById as NextRequest);
    expect(builder.in).toHaveBeenCalledWith("category", expect.arrayContaining(["booking_issue"]));

    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
    const builder2 = createQueryBuilder(result);
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder2) });
    const reqByLabel = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { category_group: "Bookings & appointments" },
    });
    await GET(reqByLabel as NextRequest);
    expect(builder2.in).toHaveBeenCalledWith("category", expect.arrayContaining(["booking_issue"]));
  });

  it("retries without the tenant embed when PostgREST cannot resolve the FK", async () => {
    const result: QueryResult = { data: [], error: null, count: 0 };
    const builder = createQueryBuilder(result);
    let selected = "";
    builder.select.mockImplementation((cols: string) => {
      selected = String(cols);
      return builder;
    });
    builder.range.mockImplementation(async () => {
      if (selected.includes("support_tickets_tenant_id_fkey")) {
        return {
          data: null,
          error: {
            code: "PGRST200",
            message: "Could not find a relationship between 'support_tickets' and 'tenants'",
          },
          count: null,
        };
      }
      return result;
    });
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: { limit: "25", offset: "0" },
    });
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const selects = builder.select.mock.calls.map((call) => String(call[0]));
    expect(selects.some((sql) => sql.includes("support_tickets_tenant_id_fkey"))).toBe(true);
    expect(selects.some((sql) => !sql.includes("support_tickets_tenant_id_fkey"))).toBe(true);
  });

  it("still returns the ticket list when count queries fail", async () => {
    const rows = [{ id: "t1", status: "open", priority: "medium", channel: "app" }];
    const listResult: QueryResult = { data: rows, error: null, count: 1 };
    const listBuilder = createQueryBuilder(listResult);
    const countResult: QueryResult = {
      data: null,
      error: new Error("canceling statement due to statement timeout"),
      count: null,
    };
    const countBuilder = Object.assign(createQueryBuilder(countResult), {
      then(
        onfulfilled?: (value: QueryResult) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(countResult).then(onfulfilled, onrejected);
      },
    });
    const from = vi.fn((table: string) => {
      if (table === "support_tickets" && from.mock.calls.length > 1) return countBuilder;
      return listBuilder;
    });
    mockGetSupabaseAdmin.mockReturnValue({ from });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const tenantId = "c43f7511-ca1b-4ccd-a0b9-27056531c65b";
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: {
        limit: "25",
        offset: "0",
        include_counts: "1",
        tenant_id: tenantId,
      },
    });
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets).toHaveLength(1);
    expect(body.counts).toBeUndefined();
    expect(countBuilder.eq).toHaveBeenCalledWith("tenant_id", tenantId);
    expect(from.mock.calls.filter((call) => call[0] === "support_tickets").length).toBeGreaterThan(1);
  });

  it("pages a thenable PostgREST builder instead of executing it before range()", async () => {
    const result: QueryResult = { data: [{ id: "t1", status: "open", priority: "medium" }], error: null, count: 1 };
    const builder = createQueryBuilder(result);
    let rangeCalled = false;
    let thenCallsBeforeRange = 0;
    Object.assign(builder, {
      then(
        onfulfilled?: (value: QueryResult) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) {
        if (!rangeCalled) thenCallsBeforeRange += 1;
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    });
    builder.range.mockImplementation(() => {
      rangeCalled = true;
      return Promise.resolve(result);
    });
    mockGetSupabaseAdmin.mockReturnValue({ from: vi.fn().mockReturnValue(builder) });

    const { GET } = await import("@/app/api/admin/support-tickets/route");
    const req = createMockNextRequest({
      method: "GET",
      url: "http://localhost:3000/api/admin/support-tickets",
      searchParams: {
        limit: "25",
        offset: "0",
        include_counts: "1",
        scope: "tenant",
        tenant_id: "c43f7511-ca1b-4ccd-a0b9-27056531c65b",
      },
    });
    const res = await GET(req as NextRequest);
    expect(res.status).toBe(200);
    expect(builder.range).toHaveBeenCalledWith(0, 24);
    expect(thenCallsBeforeRange).toBe(0);
    const body = await res.json();
    expect(body.tickets).toHaveLength(1);
  });
});
