import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireSuperadmin = vi.fn();
const mockGetSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    requireSuperadmin: (...args: unknown[]) => mockRequireSuperadmin(...args),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

describe("PATCH admin invoice payment confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperadmin.mockResolvedValue(undefined);
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => {
        const c: Record<string, unknown> = {};
        c.select = vi.fn(() => c);
        c.eq = vi.fn(() => c);
        c.maybeSingle = vi.fn(() =>
          Promise.resolve({
            data: { id: "pay-1", invoice_id: "inv-1", amount: 50, status: "pending" },
            error: null,
          }),
        );
        return c;
      }),
    });
  });

  it("rejects bank transfer confirm with 400", async () => {
    const { PATCH } = await import("../[id]/payments/[paymentId]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/invoices/inv-1/payments/pay-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "confirm" }),
      }),
      { params: Promise.resolve({ id: "inv-1", paymentId: "pay-1" }) },
    );
    expect(res.status).toBe(400);
  });
});
