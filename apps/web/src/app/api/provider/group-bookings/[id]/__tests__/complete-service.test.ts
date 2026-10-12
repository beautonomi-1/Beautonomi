import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ID = "44444444-4444-4444-8444-444444444444";

const mockGetSupabaseAdmin = vi.fn();
const mockGetSupabaseServer = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockRequirePermission = vi.fn();

const bookingsUpdateChain = {
  eq: vi.fn(),
  in: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireAnyPermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

describe("POST /api/provider/group-bookings/[id]?action=complete_service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1", role: "provider_owner" },
    });
    mockGetProviderIdForUser.mockResolvedValue(PROVIDER_ID);
    mockGetSupabaseServer.mockResolvedValue({});

    bookingsUpdateChain.eq.mockReturnValue(bookingsUpdateChain);
    bookingsUpdateChain.in.mockResolvedValue({ error: null });

    const groupUpdateSingle = vi.fn().mockResolvedValue({
      data: { id: GROUP_ID, status: "completed" },
      error: null,
    });

    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "group_bookings") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: GROUP_ID, status: "started", total_price: 100 },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: groupUpdateSingle,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "bookings") {
          return {
            update: vi.fn().mockReturnValue(bookingsUpdateChain),
          };
        }
        throw new Error(`unexpected ${table}`);
      }),
    });
  });

  it("completes child bookings in widened status set and marks group completed", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new NextRequest(
        `http://localhost/api/provider/group-bookings/${GROUP_ID}?action=complete_service`,
        { method: "POST", body: "{}" }
      ),
      { params: Promise.resolve({ id: GROUP_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.group_booking.status).toBe("completed");
    expect(bookingsUpdateChain.in).toHaveBeenCalledWith("status", [
      "in_progress",
      "confirmed",
      "waiting",
      "checked_in",
    ]);
  });
});
