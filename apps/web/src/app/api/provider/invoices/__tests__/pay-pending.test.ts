import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequirePermission = vi.fn();
const mockGetSupabaseAdmin = vi.fn();
const mockUserHasProviderAccessAdmin = vi.fn();

vi.mock("@/lib/auth/requirePermission", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: (...args: unknown[]) => mockGetSupabaseAdmin(...args),
}));

vi.mock("@/lib/supabase/api-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api-helpers")>();
  return {
    ...actual,
    userHasProviderAccessAdmin: (...args: unknown[]) => mockUserHasProviderAccessAdmin(...args),
  };
});

function makeAdmin(invoice: Record<string, unknown>, pendingExists = false) {
  const paymentsChain: Record<string, unknown> = {};
  paymentsChain.select = vi.fn(() => paymentsChain);
  paymentsChain.eq = vi.fn(() => paymentsChain);
  paymentsChain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: pendingExists ? { id: "pay-pending" } : null, error: null }),
  );
  paymentsChain.insert = vi.fn(() => Promise.resolve({ data: { id: "pay-new" }, error: null }));
  paymentsChain.update = vi.fn(() => paymentsChain);

  return {
    from: vi.fn((table: string) => {
      if (table === "provider_invoices") {
        const c: Record<string, unknown> = {};
        c.select = vi.fn(() => c);
        c.eq = vi.fn(() => c);
        c.maybeSingle = vi.fn(() => Promise.resolve({ data: invoice, error: null }));
        return c;
      }
      if (table === "provider_invoice_payments") return paymentsChain;
      throw new Error(`unexpected ${table}`);
    }),
  };
}

describe("POST /api/provider/invoices/[id]/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1" },
    });
    mockUserHasProviderAccessAdmin.mockResolvedValue(true);
  });

  it("rejects new bank transfer claims with 400", async () => {
    mockRequirePermission.mockResolvedValue({
      authorized: true,
      user: { id: "user-1" },
    });

    const { POST } = await import("../[id]/pay/route");
    const res = await POST(
      new NextRequest("http://localhost/api/provider/invoices/inv-1/pay", {
        method: "POST",
        body: JSON.stringify({ amount: 40, paymentReference: "EFT-1" }),
      }),
      { params: Promise.resolve({ id: "inv-1" }) },
    );
    expect(res.status).toBe(400);
    expect(mockGetSupabaseAdmin).not.toHaveBeenCalled();
  });
});
