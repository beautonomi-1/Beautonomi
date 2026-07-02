import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "../helpers/mock-supabase";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
  errorResponse: (message: string, code: string, status: number) =>
    new Response(JSON.stringify({ error: { message, code } }), { status, headers: { "content-type": "application/json" } }),
  handleApiError: (error: unknown, message = "Error") =>
    new Response(JSON.stringify({ error: { message: `${message}: ${error instanceof Error ? error.message : String(error)}` } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  successResponse: (data: unknown) =>
    new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } }),
}));

vi.mock("@/lib/support/support-ticket-staff", () => ({
  SUPPORT_TICKET_STAFF_ROLES: ["superadmin", "support_agent"],
}));

describe("POST /api/admin/support-tickets/[id]/seen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: MOCK_USERS.superadmin });
  });

  it("returns 404 when ticket not found", async () => {
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const { POST } = await import("@/app/api/admin/support-tickets/[id]/seen/route");
    const req = createMockNextRequest({ method: "POST", url: "http://localhost:3000/api/admin/support-tickets/missing/seen" });
    const res = await POST(req as NextRequest, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("stamps last_staff_view_at and returns 200", async () => {
    const updateMock = vi.fn().mockResolvedValue({ data: {}, error: null });
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "ticket-1" }, error: null }),
        update: vi.fn().mockReturnValue({ eq: updateMock }),
      }),
    });

    const { POST } = await import("@/app/api/admin/support-tickets/[id]/seen/route");
    const req = createMockNextRequest({ method: "POST", url: "http://localhost:3000/api/admin/support-tickets/ticket-1/seen" });
    const res = await POST(req as NextRequest, { params: Promise.resolve({ id: "ticket-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.seen_at).toBeTruthy();
  });
});
