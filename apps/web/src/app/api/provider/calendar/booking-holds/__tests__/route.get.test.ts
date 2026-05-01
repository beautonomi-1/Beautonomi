import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNextRequest, MOCK_USERS } from "@/__tests__/helpers/mock-supabase";
import { GET } from "../route";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/api-helpers")>(
    "@/lib/supabase/api-helpers",
  );
  return {
    ...actual,
    requireRoleInApi: vi.fn(),
    getProviderIdForUser: vi.fn(),
    successResponse: vi.fn((data: unknown) =>
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
    notFoundResponse: vi.fn(() => new Response(JSON.stringify({ error: "not found" }), { status: 404 })),
    handleApiError: vi.fn((err: Error) =>
      new Response(JSON.stringify({ error: err.message }), { status: 400 }),
    ),
  };
});

vi.mock("@/lib/reports/provider-report-utils", () => ({
  getProviderReportContext: vi.fn(async () => ({
    timezone: "Africa/Johannesburg",
    providerId: "provider-1",
  })),
}));

const owner = MOCK_USERS.provider_owner;

function createAwaitableChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    data: result.data,
    error: result.error,
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
  };
  return chain;
}

describe("GET /api/provider/calendar/booking-holds", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireRoleInApi, getProviderIdForUser } = await import("@/lib/supabase/api-helpers");
    vi.mocked(requireRoleInApi).mockResolvedValue({ user: owner } as never);
    vi.mocked(getProviderIdForUser).mockResolvedValue("provider-1");
  });

  it("returns 400 when date params are missing", async () => {
    const { handleApiError } = await import("@/lib/supabase/api-helpers");
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue({ from: vi.fn() } as never);

    await GET(
      createMockNextRequest({
        url: "http://localhost/api/provider/calendar/booking-holds",
      }) as never,
    );

    expect(handleApiError).toHaveBeenCalled();
  });

  it("queries active holds and maps segments with hold metadata", async () => {
    const chain = createAwaitableChain({
      data: [
        {
          id: "hold-1",
          staff_id: "staff-1",
          start_at: "2026-05-01T07:00:00.000Z",
          end_at: "2026-05-01T07:30:00.000Z",
          hold_status: "active",
          expires_at: "2026-05-01T07:25:00.000Z",
          metadata: null,
        },
      ],
      error: null,
    });
    const supabase = { from: vi.fn(() => chain) };
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(supabase as never);

    const { successResponse } = await import("@/lib/supabase/api-helpers");

    await GET(
      createMockNextRequest({
        url: "http://localhost/api/provider/calendar/booking-holds?date_from=2026-05-01&date_to=2026-05-07",
      }) as never,
    );

    expect(chain.eq).toHaveBeenCalledWith("provider_id", "provider-1");
    expect(chain.in).toHaveBeenCalledWith("hold_status", ["active", "consuming"]);

    const payload = vi.mocked(successResponse).mock.calls.at(-1)?.[0] as Array<{
      hold_id?: string;
      block_type?: string;
      reason?: string;
    }>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload?.length).toBeGreaterThanOrEqual(1);
    expect(payload?.[0]?.hold_id).toBe("hold-1");
    expect(payload?.[0]?.block_type).toBe("hold");
    expect(payload?.[0]?.reason).toContain("hold");
  });

  it("returns empty array when booking_holds table is missing", async () => {
    const chain = createAwaitableChain({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    });
    const supabase = { from: vi.fn(() => chain) };
    const { getSupabaseServer } = await import("@/lib/supabase/server");
    vi.mocked(getSupabaseServer).mockResolvedValue(supabase as never);

    const { successResponse } = await import("@/lib/supabase/api-helpers");

    await GET(
      createMockNextRequest({
        url: "http://localhost/api/provider/calendar/booking-holds?date_from=2026-05-01&date_to=2026-05-07",
      }) as never,
    );

    const payload = vi.mocked(successResponse).mock.calls.at(-1)?.[0];
    expect(payload).toEqual([]);
  });
});
