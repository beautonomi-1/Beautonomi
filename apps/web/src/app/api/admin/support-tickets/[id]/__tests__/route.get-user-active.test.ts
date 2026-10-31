import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockStaffCanAccessSupportTicket = vi.fn();

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

vi.mock("@/lib/support/assert-staff-ticket-access", () => ({
  staffCanAccessSupportTicket: (...args: unknown[]) => mockStaffCanAccessSupportTicket(...args),
}));

function createSupabase(ticketUser: Record<string, unknown> | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === "support_tickets") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: ticketUser
                  ? {
                      id: "ticket-1",
                      tenant_id: "tenant-1",
                      status: "open",
                      priority: "medium",
                      user: ticketUser,
                    }
                  : null,
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
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      if (table === "support_ticket_notes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("GET /api/admin/support-tickets/[id] requester is_active", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "admin-1", role: "superadmin" } });
    mockStaffCanAccessSupportTicket.mockResolvedValue(true);
  });

  it("maps deactivated_at to user.is_active for the admin sidebar", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabase({
        id: "user-1",
        email: "a@example.com",
        full_name: "Alex",
        phone: null,
        role: "customer",
        deactivated_at: "2026-01-15T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      }),
    );

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ticket.user.is_active).toBe(false);
    expect(body.ticket.user).not.toHaveProperty("deactivated_at");
  });

  it("sets user.is_active true when deactivated_at is null", async () => {
    mockGetSupabaseAdmin.mockReturnValue(
      createSupabase({
        id: "user-2",
        email: "b@example.com",
        full_name: "Blake",
        phone: "+27123456789",
        role: "customer",
        deactivated_at: null,
        created_at: "2025-06-01T00:00:00.000Z",
      }),
    );

    const { GET } = await import("../route");
    const req = new NextRequest("http://localhost/api/admin/support-tickets/ticket-1");
    const res = await GET(req, { params: Promise.resolve({ id: "ticket-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ticket.user.is_active).toBe(true);
  });
});
