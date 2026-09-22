import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockInsert = vi.fn();
const mockGetUser = vi.fn();

function buildSupabaseMock() {
  const chain = {
    eq: vi.fn(function eq(this: typeof chain) {
      return chain;
    }),
    or: vi.fn(function or(this: typeof chain) {
      return chain;
    }),
    limit: vi.fn(function limit(this: typeof chain) {
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data: null })),
    select: vi.fn(function select(this: typeof chain) {
      return chain;
    }),
    single: vi.fn(async () => ({
      data: { id: "1", city_name: "Cape Town", name: "Test" },
      error: null,
    })),
  };
  chain.eq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);

  return {
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => chain,
      insert: mockInsert.mockReturnValue({ select: () => ({ single: chain.single }) }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(async () => buildSupabaseMock()),
}));

vi.mock("@/lib/rate-limit/public-mutation", () => ({
  checkPublicMutationRateLimit: vi.fn(async () => ({ allowed: true })),
}));

describe("POST /api/public/city-waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("rejects missing email and phone", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/public/city-waitlist", {
      method: "POST",
      body: JSON.stringify({ city_name: "Cape Town", name: "Jane" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts email with country and persona fields", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/public/city-waitlist", {
      method: "POST",
      body: JSON.stringify({
        city_name: "Austin",
        name: "Jane",
        email: "jane@example.com",
        country_code: "US",
        source: "customer_app",
        persona: "customer",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalled();
  });
});
