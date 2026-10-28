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

vi.mock("@/lib/notifications/notification-service", () => ({
  notifyProviderInvoicePaid: vi.fn(),
}));

function makeAdminForConfirm() {
  let updateCalls = 0;
  const paymentRow = { id: "pay-1", invoice_id: "inv-1", amount: 50, status: "pending" };
  return {
    admin: {
      from: vi.fn((table: string) => {
        if (table === "provider_invoice_payments") {
          const c: Record<string, unknown> = {};
          c.select = vi.fn(() => c);
          c.eq = vi.fn(() => c);
          c.maybeSingle = vi.fn(() => Promise.resolve({ data: paymentRow, error: null }));
          c.update = vi.fn(() => {
            updateCalls += 1;
            paymentRow.status = "completed";
            const u: Record<string, unknown> = {};
            u.eq = vi.fn(() => u);
            u.select = vi.fn(() => u);
            u.maybeSingle = vi.fn(() =>
              Promise.resolve({ data: { ...paymentRow, status: "completed" }, error: null }),
            );
            return u;
          });
          return c;
        }
        if (table === "provider_invoices") {
          const c: Record<string, unknown> = {};
          c.select = vi.fn(() => c);
          c.eq = vi.fn(() => c);
          c.maybeSingle = vi.fn(() =>
            Promise.resolve({
              data: {
                id: "inv-1",
                provider_id: "prov-1",
                status: "paid",
                invoice_number: "INV-1",
                total_amount: 50,
              },
              error: null,
            }),
          );
          return c;
        }
        throw new Error(table);
      }),
    },
    getUpdateCalls: () => updateCalls,
  };
}

describe("PATCH admin invoice payment confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSuperadmin.mockResolvedValue(undefined);
  });

  it("confirms pending payment once", async () => {
    const { admin, getUpdateCalls } = makeAdminForConfirm();
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { PATCH } = await import("../[id]/payments/[paymentId]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/admin/invoices/inv-1/payments/pay-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "confirm" }),
      }),
      { params: Promise.resolve({ id: "inv-1", paymentId: "pay-1" }) },
    );
    expect(res.status).toBe(200);
    expect(getUpdateCalls()).toBe(1);

    const again = await PATCH(
      new NextRequest("http://localhost/api/admin/invoices/inv-1/payments/pay-1", {
        method: "PATCH",
        body: JSON.stringify({ action: "confirm" }),
      }),
      { params: Promise.resolve({ id: "inv-1", paymentId: "pay-1" }) },
    );
    const body = await again.json();
    expect(again.status).toBe(200);
    expect(body.data?.already_confirmed ?? body.data?.payment?.status).toBeTruthy();
  });
});
