import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../[id]/route";

const updateMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", () => ({
  getProviderIdForUser: vi.fn(async () => "provider-1"),
  successResponse: vi.fn((data) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ),
  notFoundResponse: vi.fn((message) =>
    new Response(JSON.stringify({ error: message }), { status: 404 }),
  ),
  handleApiError: vi.fn((error) =>
    new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
  ),
}));

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: vi.fn(async () => ({
    authorized: true,
    user: { id: "staff-user-1" },
  })),
}));

vi.mock("@/lib/waitlist/matching", () => ({
  matchWaitlistOnCancellation: vi.fn(async () => undefined),
}));

function createAdminClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: { id: "booking-wr-1" }, error: null })),
      update: updateMock.mockReturnValue({
        eq: vi.fn(async () => ({ error: null })),
      }),
    })),
  };
}

describe("DELETE /api/provider/waiting-room/[id]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(createAdminClient() as never);
  });

  it("sets cancelled_by and cancelled_at when the client leaves", async () => {
    const req = new Request("https://example.test/api/provider/waiting-room/booking-wr-1", {
      method: "DELETE",
    }) as never;

    const res = await DELETE(req, { params: Promise.resolve({ id: "booking-wr-1" }) });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "cancelled",
        cancelled_by: "staff-user-1",
        cancelled_at: expect.any(String),
      }),
    );
  });
});
