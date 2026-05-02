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

vi.mock("@/lib/notifications/notification-service", () => ({
  notifySupportTicketUpdated: vi.fn(),
  notifySupportStaffInboxActivity: vi.fn(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
  extractRequestMeta: vi.fn(() => ({ ip_address: null, user_agent: null })),
}));

describe("PATCH /api/admin/support-tickets/[id] concurrency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
  });

  it("returns 409 CONCURRENT_UPDATE when expected_updated_at does not match row", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          assigned_to: null,
          ticket_number: "SUP-42",
          created_at: "2026-01-01T00:00:00.000Z",
          priority: "normal",
          resolved_at: null,
          updated_at: "2026-05-01T12:00:00.000Z",
        },
        error: null,
      }),
    };

    mockGetSupabaseServer.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => selectChain),
      })),
    });

    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets/ticket-1", {
      method: "PATCH",
      body: JSON.stringify({
        status: "in_progress",
        expected_updated_at: "2026-05-01T11:59:59.000Z",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe("CONCURRENT_UPDATE");
    expect(typeof body.error?.message).toBe("string");
  });
});
