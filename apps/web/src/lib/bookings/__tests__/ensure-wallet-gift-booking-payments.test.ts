import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWalletGiftBookingPayments } from "../ensure-wallet-gift-booking-payments";

type Inserted = {
  booking_id: string;
  amount: number;
  payment_method: string;
  payment_provider: string;
  payment_provider_id: string;
  status: string;
  tenant_id?: string | null;
};

/**
 * Minimal Supabase mock that records inserts and pretends rows exist when their
 * payment_provider_id matches a pre-seeded set (used to exercise idempotency).
 */
function makeAdmin(opts: { existingProviderIds?: Set<string>; failInsert?: boolean } = {}) {
  const existing = opts.existingProviderIds ?? new Set<string>();
  const inserts: Inserted[] = [];

  const fromMock = vi.fn((table: string) => {
    if (table !== "booking_payments") {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      // Lookup chain: select().eq().eq().maybeSingle()
      select() {
        let bookingId = "";
        let providerId = "";
        const chain = {
          eq(col: string, val: string) {
            if (col === "booking_id") bookingId = val;
            if (col === "payment_provider_id") providerId = val;
            return chain;
          },
          async maybeSingle() {
            void bookingId;
            const hit = existing.has(providerId);
            return { data: hit ? { id: "existing", status: "completed" } : null };
          },
        };
        return chain;
      },
      async insert(row: Inserted) {
        if (opts.failInsert) {
          return { error: { code: "23505", message: "duplicate key" } };
        }
        inserts.push(row);
        return { error: null };
      },
    };
  });

  return {
    admin: { from: fromMock } as unknown as SupabaseClient,
    inserts,
  };
}

describe("ensureWalletGiftBookingPayments", () => {
  it("inserts wallet + gift rows when none exist", async () => {
    const { admin, inserts } = makeAdmin();
    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-1",
      tenantId: "t-1",
      walletAmount: 50,
      giftCardAmount: 25,
    });
    expect(inserts).toHaveLength(2);
    const wallet = inserts.find((i) => i.payment_method === "wallet")!;
    const gift = inserts.find((i) => i.payment_method === "gift_card")!;
    expect(wallet.amount).toBe(50);
    expect(wallet.payment_provider_id).toBe("wallet_booking:b-1");
    expect(wallet.payment_provider).toBe("wallet");
    expect(wallet.status).toBe("completed");
    expect(wallet.tenant_id).toBe("t-1");
    expect(gift.amount).toBe(25);
    expect(gift.payment_provider_id).toBe("gift_card_booking:b-1");
  });

  it("is idempotent: skips insert when a row with the synthetic provider id already exists", async () => {
    const { admin, inserts } = makeAdmin({
      existingProviderIds: new Set(["wallet_booking:b-2", "gift_card_booking:b-2"]),
    });
    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-2",
      tenantId: null,
      walletAmount: 50,
      giftCardAmount: 25,
    });
    expect(inserts).toHaveLength(0);
  });

  it("skips zero amounts entirely", async () => {
    const { admin, inserts } = makeAdmin();
    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-3",
      tenantId: null,
      walletAmount: 0,
      giftCardAmount: 0,
    });
    expect(inserts).toHaveLength(0);
  });

  it("uses leg suffix for follow-up payment rows", async () => {
    const { admin, inserts } = makeAdmin();
    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-leg",
      tenantId: null,
      walletAmount: 30,
      giftCardAmount: 0,
      paymentLegSuffix: ":remaining:ref-1",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.payment_provider_id).toBe("wallet_booking:b-leg:remaining:ref-1");
  });

  it("rounds amounts to 2 decimals", async () => {
    const { admin, inserts } = makeAdmin();
    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-4",
      tenantId: null,
      walletAmount: 12.345,
      giftCardAmount: 0,
    });
    expect(inserts[0]?.amount).toBe(12.35);
  });
});
