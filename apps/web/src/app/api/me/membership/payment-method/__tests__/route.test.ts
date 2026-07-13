import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: vi.fn(),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireRoleInApi: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
  };
});

describe("POST /api/me/membership/payment-method", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success false for invalid body", async () => {
    const req = new Request("http://localhost/api/me/membership/payment-method", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    const json = await res.json();
    expect(json.data.success).toBe(false);
  });
});
