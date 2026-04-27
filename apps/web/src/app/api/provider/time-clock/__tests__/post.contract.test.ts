/**
 * Contract: clock-in-by-PIN must return `error.code` (INVALID_PIN, PROVIDER_NOT_FOUND,
 * ALREADY_CLOCKED_IN) in the standard `{ data, error }` envelope — not a 200 with `error` inside `data`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRoleInApi = vi.fn();
const mockGetProviderIdForUser = vi.fn();
const mockGetSupabaseServer = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: (...args: unknown[]) => mockRequireRoleInApi(...args),
    getProviderIdForUser: (...args: unknown[]) => mockGetProviderIdForUser(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: (...args: unknown[]) => mockGetSupabaseServer(...args),
}));

async function parseJson(res: Response) {
  return res.json() as Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

describe("POST /api/provider/time-clock (clock-in PIN contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRoleInApi.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 400 with code INVALID_PIN when pin is missing or not 4 digits", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/time-clock", {
      method: "POST",
      body: JSON.stringify({ pin: "12" }),
    });
    const res = await POST(req);
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.data).toBeNull();
    expect(body.error?.code).toBe("INVALID_PIN");
  });

  it("returns 404 with code PROVIDER_NOT_FOUND when user has no provider", async () => {
    mockGetProviderIdForUser.mockResolvedValue(null);
    const supabase = {};
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/time-clock", {
      method: "POST",
      body: JSON.stringify({ pin: "1234" }),
    });
    const res = await POST(req);
    const body = await parseJson(res);
    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("PROVIDER_NOT_FOUND");
  });

  it("returns 401 with code INVALID_PIN when no staff matches PIN", async () => {
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
      })),
    };
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/time-clock", {
      method: "POST",
      body: JSON.stringify({ pin: "9999" }),
    });
    const res = await POST(req);
    const body = await parseJson(res);
    expect(res.status).toBe(401);
    expect(body.error?.code).toBe("INVALID_PIN");
  });

  it("returns 400 with code ALREADY_CLOCKED_IN when active time card exists", async () => {
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    const staff = { id: "staff-1", name: "A", time_clock_enabled: true };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_staff") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: staff, error: null }),
          };
        }
        if (table === "staff_time_cards") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "card-1" }, error: null }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/time-clock", {
      method: "POST",
      body: JSON.stringify({ pin: "1234" }),
    });
    const res = await POST(req);
    const body = await parseJson(res);
    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("ALREADY_CLOCKED_IN");
  });

  it("returns 200 with clocked_in payload on successful insert", async () => {
    mockGetProviderIdForUser.mockResolvedValue("prov-1");
    const staff = { id: "staff-1", name: "Alex", time_clock_enabled: true };
    const timeCard = {
      id: "tc-1",
      clock_in_time: "2026-04-27T08:00:00.000Z",
    };
    let timeCardsCall = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "provider_staff") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: staff, error: null }),
          };
        }
        if (table === "staff_time_cards") {
          timeCardsCall += 1;
          if (timeCardsCall === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: timeCard, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockGetSupabaseServer.mockResolvedValue(supabase);

    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/provider/time-clock", {
      method: "POST",
      body: JSON.stringify({ pin: "1234" }),
    });
    const res = await POST(req);
    const body = await parseJson(res);
    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect((body.data as { status?: string }).status).toBe("clocked_in");
    expect((body.data as { id?: string }).id).toBe("tc-1");
  });
});
