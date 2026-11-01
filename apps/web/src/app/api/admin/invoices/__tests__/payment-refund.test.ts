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

describe("PATCH admin invoice payment refund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperadmin.mockResolvedValue(undefined);
    mockGetSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "provider_invoice_payments") {
          const c: Record<string, unknown> = {};
          c.select = vi.fn(() => c);
          c.eq = vi.fn(() => c);
          c.maybeSingle = vi.fn(() =>
            Promise.resolve({
              data: {
                id: "pay-1",
                invoice_id: "inv-1",
                amount: 50,
                status: "completed",
              },
              error: null,
            }),
          );
          c.update = vi.fn(() => {
            const u: Record<string, unknown> = {};
            u.eq = vi.fn(() => u);
            u.select = vi.fn(() => u);
            u.maybeSingle = vi.fn(() =>
              Promise.resolve({
                data: { id: "pay-1", status: "refunded" },
                error: null,
              }),
            );
            return u;
          });
          return c;
        }
        throw new Error(table);
      }),
    });
  });

  it("still allows refund on completed payment", async () => {
    const { PATCH } = await import("../[id]/payments/[paymentId]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/invoices/inv-1/payments/pay-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "refund" }),
      }),
      { params: Promise.resolve({ id: "inv-1", paymentId: "pay-1" }) },
    );
    expect(res.status).toBe(200);
  });
});
