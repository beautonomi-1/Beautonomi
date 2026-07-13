import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireAuthInApi = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireAuthInApi: (...args: unknown[]) => mockRequireAuthInApi(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

describe("PATCH /api/recurring-bookings/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthInApi.mockResolvedValue({ user: { id: "user-1" } });
    mockGetSupabaseServer.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "series-1" }, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: "series-1" }, error: null }),
            }),
          }),
        }),
      }),
    });
  });

  it("returns 400 VALIDATION_ERROR for invalid preferred_time", async () => {
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/recurring-bookings/series-1", {
      method: "PATCH",
      body: JSON.stringify({ preferred_time: "25:99" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "series-1" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(String(body.error?.message)).toMatch(/preferred_time/i);
  });

  it("accepts valid HH:MM preferred_time", async () => {
    const { PATCH } = await import("../route");
    const req = new NextRequest("http://localhost/api/recurring-bookings/series-1", {
      method: "PATCH",
      body: JSON.stringify({ preferred_time: "14:30" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "series-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data?.recurring).toBeTruthy();
  });
});
