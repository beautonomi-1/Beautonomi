import { beforeEach, describe, expect, it, vi } from "vitest";

const restock = vi.fn();
const creditWallet = vi.fn(async () => ({ credited: false, failed: false }));
const refundCards = vi.fn(async () => ({ onlineRefunded: 0, walletFallback: 0, failed: false }));
const voidGift = vi.fn(async () => undefined);
const notify = vi.fn(async () => undefined);

vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: () => ({ valid: true }),
}));
vi.mock("@/lib/cron/locked-cron-route", () => ({
  runLockedCronRoute: async (_name: string, fn: () => Promise<Response>) => fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/orders/product-order-lifecycle", () => ({
  restockProductOrderLineItems: (...args: unknown[]) => restock(...args),
  creditWalletForProductOrderIfNeeded: (...args: unknown[]) => creditWallet(...args),
  refundUnpaidProductOrderCardCharges: (...args: unknown[]) => refundCards(...args),
  voidProductOrderGiftCardIfNeeded: (...args: unknown[]) => voidGift(...args),
  ABANDONED_ORDER_REFUND_STILL_DUE: "Payment was not completed in time — refund still due",
}));
vi.mock("@/lib/notifications/notify-product-order-status", () => ({
  dispatchProductOrderStatusNotification: (...args: unknown[]) => notify(...args),
}));

const STOCK_RELEASED = "Payment was not completed in time — stock released";
const STOCK_STILL_OUT = "Payment was not completed in time — products still out";

function adminWith(results: Array<{ data: unknown; error: null }>) {
  const updates: Record<string, unknown>[] = [];
  let call = 0;
  return {
    updates,
    from() {
      const result = results[call++] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.in = self;
      chain.lt = self;
      chain.order = self;
      chain.limit = self;
      chain.update = (payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  };
}

describe("expire pending payment orders", () => {
  beforeEach(() => {
    restock.mockReset();
    creditWallet.mockReset();
    refundCards.mockReset();
    voidGift.mockReset();
    notify.mockReset();
    restock.mockResolvedValue(undefined);
    creditWallet.mockResolvedValue({ credited: false, failed: false });
    refundCards.mockResolvedValue({ onlineRefunded: 0, walletFallback: 0, failed: false });
    voidGift.mockResolvedValue(undefined);
  });

  it("finishes the refund and puts the products back on a later sweep", async () => {
    const admin = adminWith([
      { data: [], error: null },
      { data: [], error: null },
      {
        data: [
          {
            id: "order-1",
            customer_id: "cust-1",
            provider_id: "prov-1",
            tenant_id: "tenant-1",
            order_number: "PO-1",
          },
        ],
        error: null,
      },
      { data: [{ id: "order-1" }], error: null },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-orders") as never);
    const body = await res.json();

    expect(body.stock_retried).toBe(1);
    expect(restock).toHaveBeenCalledWith(admin, "order-1");
    expect(creditWallet).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: "order-1" }),
      "Wallet refund (online payment not completed)",
      "product_order_payment_abandoned",
    );
    expect(voidGift).toHaveBeenCalled();
    expect(refundCards).toHaveBeenCalled();
    expect(admin.updates).toContainEqual(expect.objectContaining({ cancellation_reason: STOCK_RELEASED }));
    expect(notify).toHaveBeenCalledOnce();
  });

  it("marks the order so the next sweep can put the products back when the first return fails", async () => {
    restock.mockRejectedValueOnce(new Error("stock down"));
    const admin = adminWith([
      {
        data: [
          {
            id: "order-2",
            customer_id: "cust-1",
            provider_id: "prov-1",
            tenant_id: "tenant-1",
            wallet_amount: 0,
            order_number: "PO-2",
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: "order-2" }], error: null },
      { data: null, error: null },
      { data: [], error: null },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-orders") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(body.stock_retried).toBe(0);
    expect(creditWallet).toHaveBeenCalledOnce();
    expect(admin.updates).toContainEqual(expect.objectContaining({ cancellation_reason: STOCK_STILL_OUT }));
    expect(notify).not.toHaveBeenCalled();
  });

  it("marks the refund still due when the wallet return fails and the products are back", async () => {
    creditWallet.mockResolvedValue({ credited: false, failed: true });
    const admin = adminWith([
      {
        data: [
          {
            id: "order-3",
            customer_id: "cust-1",
            provider_id: "prov-1",
            tenant_id: "tenant-1",
            wallet_amount: 40,
            currency: "ZAR",
            order_number: "PO-3",
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: "order-3" }], error: null },
      { data: [{ id: "order-3" }], error: null },
      { data: [], error: null },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-orders") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(restock).toHaveBeenCalledWith(admin, "order-3");
    expect(admin.updates).toContainEqual(
      expect.objectContaining({
        cancellation_reason: "Payment was not completed in time — refund still due",
      }),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("marks the refund still due when the gift card return does not answer", async () => {
    voidGift.mockResolvedValue("failed");
    const admin = adminWith([
      {
        data: [
          {
            id: "order-4",
            customer_id: "cust-1",
            provider_id: "prov-1",
            tenant_id: "tenant-1",
            gift_card_amount: 25,
            order_number: "PO-4",
          },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: "order-4" }], error: null },
      { data: [{ id: "order-4" }], error: null },
      { data: [], error: null },
    ]);
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    const { GET } = await import("../route");

    const res = await GET(new Request("http://localhost/api/cron/expire-pending-payment-orders") as never);
    const body = await res.json();

    expect(body.expired).toBe(0);
    expect(admin.updates).toContainEqual(
      expect.objectContaining({
        cancellation_reason: "Payment was not completed in time — refund still due",
      }),
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
