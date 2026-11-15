import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/resolve-tenant-id-for-ledger", () => ({
  resolveTenantIdForFinanceLedger: async () => "tenant-1",
}));

type Row = Record<string, unknown>;

function adminFor(options: {
  walletCreditError?: { message: string } | null;
  giftVoid?: boolean | null;
  giftVoidError?: { message: string } | null;
}) {
  const updates: Row[] = [];
  const deleted: string[][] = [];
  const payments: Row[] = [
    {
      id: "pay-wallet",
      booking_id: "booking-1",
      amount: 40,
      payment_method: "wallet",
      payment_provider_id: "wallet_booking:booking-1:remaining:ref",
      status: "pending",
    },
    {
      id: "pay-gift",
      booking_id: "booking-1",
      amount: 25,
      payment_method: "gift_card",
      payment_provider_id: "gift_card_booking:booking-1:remaining:ref",
      status: "pending",
    },
  ];
  const booking = { wallet_amount: 40, gift_card_amount: 25 };
  const credits: Row[] = [];

  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      let filters: Record<string, unknown> = {};
      let pendingUpdate: Row | null = null;
      let deleting = false;
      chain.select = self;
      chain.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      };
      chain.in = (column: string, values: string[]) => {
        filters[column] = values;
        return chain;
      };
      chain.update = (payload: Row) => {
        pendingUpdate = payload;
        return chain;
      };
      chain.delete = () => {
        deleting = true;
        return chain;
      };
      chain.maybeSingle = async () => {
        if (table === "bookings") return { data: { ...booking }, error: null };
        const row = payments.find(
          (payment) =>
            payment.booking_id === filters.booking_id &&
            payment.payment_provider_id === filters.payment_provider_id &&
            payment.status === "pending",
        );
        return { data: row ? { id: row.id } : null, error: null };
      };
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (deleting) deleted.push([...(filters.payment_provider_id as string[] | undefined) ?? []]);
        if (pendingUpdate && table === "bookings") Object.assign(booking, pendingUpdate);
        if (pendingUpdate && table === "booking_payments" && filters.id) {
          const row = payments.find((payment) => payment.id === filters.id);
          if (row) Object.assign(row, pendingUpdate);
        }
        if (pendingUpdate) updates.push({ table, payload: pendingUpdate });
        return resolve({ error: null });
      };
      return chain;
    },
    rpc: async (name: string, args: Row) => {
      if (name === "void_gift_card_redemption") {
        return { data: options.giftVoid ?? true, error: options.giftVoidError ?? null };
      }
      credits.push({ name, ...args });
      return { error: options.walletCreditError ?? null };
    },
  };

  return { admin, updates, deleted, credits, booking, payments };
}

const input = {
  bookingId: "booking-1",
  customerId: "cust-1",
  currency: "ZAR",
  tenantId: "tenant-1",
  providerId: "prov-1",
  walletAmountToReverse: 40,
  giftCardAmountToReverse: 25,
  paymentLegSuffix: ":remaining:ref",
  idempotencyKey: "rollback-1",
};

describe("rollbackCollectibleSplitLeg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the wallet amount when the return does not finish", async () => {
    const { rollbackCollectibleSplitLeg, COLLECTIBLE_ROLLBACK_STILL_DUE } = await import(
      "../rollback-collectible-split-leg"
    );
    const { admin, booking, payments, deleted } = adminFor({
      walletCreditError: { message: "wallet down" },
      giftVoid: true,
    });

    const result = await rollbackCollectibleSplitLeg(admin as never, input);

    expect(result.walletDone).toBe(false);
    expect(booking.wallet_amount).toBe(40);
    expect(booking.gift_card_amount).toBe(0);
    expect(payments.find((row) => row.id === "pay-wallet")?.notes).toBe(COLLECTIBLE_ROLLBACK_STILL_DUE);
    expect(deleted.some((ids) => ids.includes("wallet_booking:booking-1:remaining:ref"))).toBe(false);
  });

  it("keeps the gift amount when the card return does not finish", async () => {
    const { rollbackCollectibleSplitLeg } = await import("../rollback-collectible-split-leg");
    const { admin, booking, credits } = adminFor({ giftVoidError: { message: "gift down" } });

    const result = await rollbackCollectibleSplitLeg(admin as never, input);

    expect(result.giftDone).toBe(false);
    expect(booking.gift_card_amount).toBe(25);
    expect(booking.wallet_amount).toBe(0);
    expect(credits.some((credit) => credit.p_idempotency_key === "rollback-1")).toBe(true);
  });

  it("pays a captured gift card into the wallet once", async () => {
    const { rollbackCollectibleSplitLeg } = await import("../rollback-collectible-split-leg");
    const { admin, booking, credits } = adminFor({ giftVoid: false });

    const result = await rollbackCollectibleSplitLeg(admin as never, {
      ...input,
      walletAmountToReverse: 0,
    });

    expect(result.giftDone).toBe(true);
    expect(booking.gift_card_amount).toBe(0);
    expect(credits.some((credit) => credit.p_idempotency_key === "rollback-1:gift" && credit.p_amount === 25)).toBe(
      true,
    );
  });

  it("remembers a gift card return that does not answer without changing the visit amount", async () => {
    const inserts: Record<string, unknown>[] = [];
    let voids = 0;
    const admin = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.insert = (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return chain;
        };
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
        return chain;
      },
      rpc: async () => {
        voids += 1;
        return { error: { message: "gift down" } };
      },
    };
    const { releaseGiftCardOrRemember, COLLECTIBLE_ROLLBACK_STILL_DUE } = await import(
      "../rollback-collectible-split-leg"
    );

    const released = await releaseGiftCardOrRemember(admin as never, "booking-1", "tenant-1");

    expect(released).toBe(false);
    expect(voids).toBe(2);
    expect(inserts[0]).toMatchObject({
      amount: 0,
      payment_method: "gift_card",
      notes: COLLECTIBLE_ROLLBACK_STILL_DUE,
      status: "pending",
    });
  });

  it("remembers a gift card return when the void does not say whether the card came back", async () => {
    const inserts: Record<string, unknown>[] = [];
    const admin = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.insert = (payload: Record<string, unknown>) => {
          inserts.push(payload);
          return chain;
        };
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
        return chain;
      },
      rpc: async () => ({ data: null, error: null }),
    };
    const { releaseGiftCardOrRemember } = await import("../rollback-collectible-split-leg");

    const released = await releaseGiftCardOrRemember(admin as never, "booking-1", "tenant-1");

    expect(released).toBe(false);
    expect(inserts).toHaveLength(1);
  });

  it("captures a gift card that was still reserved and leaves the visit amount in place", async () => {
    const calls: string[] = [];
    const updates: Record<string, unknown>[] = [];
    const admin = {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.limit = self;
        chain.delete = () => chain;
        chain.update = (payload: Record<string, unknown>) => {
          updates.push({ table, ...payload });
          return chain;
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: [
              {
                id: "pay-1",
                booking_id: "booking-1",
                amount: 0,
                payment_method: "gift_card",
                payment_provider_data: { capture_still_due: true },
              },
            ],
            error: null,
          });
        return chain;
      },
      rpc: async (name: string) => {
        calls.push(name);
        return { data: true, error: null };
      },
    };
    const { retryUnfinishedCollectibleRollbacks } = await import("../rollback-collectible-split-leg");

    const finished = await retryUnfinishedCollectibleRollbacks(admin as never);

    expect(finished).toBe(1);
    expect(calls).toEqual(["capture_gift_card_redemption"]);
    expect(updates.some((row) => row.gift_card_amount === 0)).toBe(false);
  });

  it("leaves the gift and the retry in place when the capture does not answer", async () => {
    const updates: Record<string, unknown>[] = [];
    let deleted = false;
    const admin = {
      from() {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.limit = self;
        chain.delete = () => {
          deleted = true;
          return chain;
        };
        chain.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          return chain;
        };
        chain.then = (resolve: (value: unknown) => unknown) =>
          resolve({
            data: [
              {
                id: "pay-1",
                booking_id: "booking-1",
                amount: 0,
                payment_method: "gift_card",
                payment_provider_data: { capture_still_due: true },
              },
            ],
            error: null,
          });
        return chain;
      },
      rpc: async () => ({ data: null, error: null }),
    };
    const { retryUnfinishedCollectibleRollbacks } = await import("../rollback-collectible-split-leg");

    const finished = await retryUnfinishedCollectibleRollbacks(admin as never);

    expect(finished).toBe(0);
    expect(deleted).toBe(false);
    expect(updates.some((row) => row.gift_card_amount === 0)).toBe(false);
  });
});
