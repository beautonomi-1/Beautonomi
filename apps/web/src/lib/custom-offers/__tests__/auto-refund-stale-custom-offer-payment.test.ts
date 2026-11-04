import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefundGatewayCharge = vi.fn();

vi.mock("@/lib/payments/refund-gateway-charge", () => ({
  refundGatewayCharge: (...args: unknown[]) => mockRefundGatewayCharge(...args),
}));

vi.mock("@/lib/payments/paystack-complete", () => ({
  convertFromSmallestUnit: (n: number) => n / 100,
}));

function makeChain(final: () => Promise<{ data: unknown; error: null }>) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["select", "eq", "in", "update", "insert"]) {
    chain[m] = vi.fn(self);
  }
  chain.maybeSingle = vi.fn(final);
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve(resolve({ data: null, error: null }));
  return chain;
}

function buildAdmin(existing: { refund_status?: string } | null) {
  let maybeSingleCalls = 0;
  const admin = {
    from: vi.fn((table: string) => {
      if (table !== "stale_payment_refunds") {
        return makeChain(async () => ({ data: null, error: null }));
      }
      return {
        select: vi.fn(() =>
          makeChain(async () => {
            maybeSingleCalls += 1;
            if (maybeSingleCalls === 1) {
              return {
                data: existing ? { id: "stale-1", refund_status: existing.refund_status } : null,
                error: null,
              };
            }
            if (maybeSingleCalls === 2) {
              return { data: { id: "stale-1" }, error: null };
            }
            return {
              data: { id: "stale-1", attempt_count: 0, refund_status: "pending" },
              error: null,
            };
          }),
        ),
        insert: vi.fn(() =>
          makeChain(async () => ({ data: { id: "stale-1" }, error: null })),
        ),
        update: vi.fn(() => makeChain(async () => ({ data: null, error: null }))),
      };
    }),
  };
  return admin;
}

describe("autoRefundStaleCustomOfferPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefundGatewayCharge.mockResolvedValue({ refundId: "refund-1" });
  });

  it("skips when already refunded", async () => {
    const admin = buildAdmin({ refund_status: "completed" });
    const { autoRefundStaleCustomOfferPayment } = await import(
      "../auto-refund-stale-custom-offer-payment"
    );
    const res = await autoRefundStaleCustomOfferPayment(admin as never, {
      offerId: "offer-1",
      reference: "pay-1",
    });
    expect(res.refunded).toBe(false);
    expect(mockRefundGatewayCharge).not.toHaveBeenCalled();
  });

  it("creates refund and marks completed", async () => {
    const admin = buildAdmin(null);
    const { autoRefundStaleCustomOfferPayment } = await import(
      "../auto-refund-stale-custom-offer-payment"
    );
    const res = await autoRefundStaleCustomOfferPayment(admin as never, {
      offerId: "offer-1",
      reference: "pay-1",
      amountMinor: 10000,
      currency: "ZAR",
    });
    expect(res.refunded).toBe(true);
    expect(mockRefundGatewayCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: "pay-1",
        idempotencyKey: "stale-refund:stale-1",
      }),
    );
  });
});
