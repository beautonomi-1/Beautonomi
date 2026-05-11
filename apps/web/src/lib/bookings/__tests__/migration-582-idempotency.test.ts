import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWalletGiftBookingPayments } from "../ensure-wallet-gift-booking-payments";

/**
 * Regression: migration 582 backfill + the runtime helper must agree on the
 * synthetic `payment_provider_id` (`wallet_booking:<id>` / `gift_card_booking:<id>`)
 * so that a booking that was either backfilled or runtime-inserted does NOT get
 * a duplicate row when the other path runs later.
 */
describe("migration 582 wallet/gift backfill ↔ runtime helper idempotency", () => {
  it("when migration 582 already inserted a backfill row, runtime helper detects and skips", async () => {
    const inserts: Array<{ booking_id: string; amount: number }> = [];
    const seenProviderIds = new Set<string>([
      "wallet_booking:b-historic-1",
      "gift_card_booking:b-historic-1",
    ]);
    const fromMock = vi.fn(() => ({
      select() {
        let providerId = "";
        const chain = {
          eq(_col: string, val: string) {
            providerId = val;
            return chain;
          },
          async maybeSingle() {
            return { data: seenProviderIds.has(providerId) ? { id: "x" } : null };
          },
        };
        return chain;
      },
      async insert(row: { booking_id: string; amount: number }) {
        inserts.push(row);
        return { error: null };
      },
    }));
    const admin = { from: fromMock } as unknown as SupabaseClient;

    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-historic-1",
      tenantId: null,
      walletAmount: 50,
      giftCardAmount: 25,
    });

    expect(inserts).toHaveLength(0);
  });

  it("when no rows present (newly created booking), helper inserts both", async () => {
    const inserts: Array<{ payment_method: string; amount: number }> = [];
    const fromMock = vi.fn(() => ({
      select() {
        const chain = {
          eq() {
            return chain;
          },
          async maybeSingle() {
            return { data: null };
          },
        };
        return chain;
      },
      async insert(row: { payment_method: string; amount: number }) {
        inserts.push(row);
        return { error: null };
      },
    }));
    const admin = { from: fromMock } as unknown as SupabaseClient;

    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "b-new-1",
      tenantId: null,
      walletAmount: 30,
      giftCardAmount: 20,
    });

    expect(inserts.map((i) => i.payment_method).sort()).toEqual(["gift_card", "wallet"]);
  });

  it("synthetic payment_provider_id matches migration 582 SQL convention", async () => {
    const recorded: Array<{ payment_provider_id: string; payment_method: string }> = [];
    const fromMock = vi.fn(() => ({
      select() {
        const chain = {
          eq() {
            return chain;
          },
          async maybeSingle() {
            return { data: null };
          },
        };
        return chain;
      },
      async insert(row: { payment_provider_id: string; payment_method: string }) {
        recorded.push(row);
        return { error: null };
      },
    }));
    const admin = { from: fromMock } as unknown as SupabaseClient;

    await ensureWalletGiftBookingPayments(admin, {
      bookingId: "abcd-1234",
      tenantId: null,
      walletAmount: 10,
      giftCardAmount: 5,
    });

    const wallet = recorded.find((r) => r.payment_method === "wallet");
    const gift = recorded.find((r) => r.payment_method === "gift_card");
    // Migration 582: 'wallet_booking:' || b.id::text  /  'gift_card_booking:' || b.id::text
    expect(wallet?.payment_provider_id).toBe("wallet_booking:abcd-1234");
    expect(gift?.payment_provider_id).toBe("gift_card_booking:abcd-1234");
  });
});

/**
 * Mirrors the SQL `update_booking_payment_status` trigger semantics from
 * migrations 582 + 589 to prove the threshold logic + refund handling.
 */
function trigger(
  totalAmount: number,
  bookingPayments: Array<{ amount: number; status: string }>,
  refunds: Array<{ amount: number; status: string }> = [],
) {
  const totalPaid = bookingPayments
    .filter((p) => p.status === "completed" || p.status === "partially_refunded")
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunded = refunds
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + r.amount, 0);

  let status: string;
  if (totalPaid === 0) status = "pending";
  else if (totalRefunded >= totalPaid) status = "refunded";
  else if (totalAmount != null && totalPaid + 0.01 >= totalAmount)
    status = totalRefunded > 0 ? "partially_refunded" : "paid";
  else if (totalPaid > 0) status = "partially_paid";
  else status = "pending";

  return { status, totalPaid, totalRefunded };
}

describe("migration 582/589 update_booking_payment_status trigger semantics", () => {
  it("paid status threshold honours +0.01 tolerance", () => {
    expect(trigger(100, [{ amount: 99.99, status: "completed" }]).status).toBe("paid");
    expect(trigger(100, [{ amount: 99.98, status: "completed" }]).status).toBe("partially_paid");
    expect(trigger(100, [{ amount: 100.01, status: "completed" }]).status).toBe("paid");
  });

  it("wallet+card ≈ total → paid (after migration 582 inserts wallet row)", () => {
    const r = trigger(154.6, [
      { amount: 50, status: "completed" }, // wallet
      { amount: 104.6, status: "completed" }, // card
    ]);
    expect(r.status).toBe("paid");
  });

  it("gift_card+card ≈ total → paid", () => {
    const r = trigger(200, [
      { amount: 75, status: "completed" }, // gift
      { amount: 125, status: "completed" }, // card
    ]);
    expect(r.status).toBe("paid");
  });

  it("partial refund of fully paid → partially_refunded", () => {
    const r = trigger(
      100,
      [{ amount: 100, status: "completed" }],
      [{ amount: 25, status: "completed" }],
    );
    expect(r.status).toBe("partially_refunded");
  });

  it("full refund → refunded", () => {
    const r = trigger(
      100,
      [{ amount: 100, status: "completed" }],
      [{ amount: 100, status: "completed" }],
    );
    expect(r.status).toBe("refunded");
  });
});
