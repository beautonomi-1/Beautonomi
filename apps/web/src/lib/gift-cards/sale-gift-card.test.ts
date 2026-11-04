import { describe, expect, it, vi } from "vitest";
import {
  heldSaleGiftAmount,
  restoreSaleGiftCard,
  saleCardAmountStillDue,
  saleChargeMatchesDue,
  saleGiftCardRejectReason,
  saleGiftTenderMismatch,
  settleReservedSaleGiftCard,
} from "./sale-gift-card";

describe("saleCardAmountStillDue", () => {
  it("charges the card for the sale total minus the gift already held", () => {
    expect(saleCardAmountStillDue(100, 40)).toBe(60);
    expect(saleCardAmountStillDue(100, 0)).toBe(100);
    expect(saleCardAmountStillDue(40, 40)).toBe(0);
  });

  it("ignores a gift that was returned and subtracts a card charge that already succeeded", () => {
    expect(heldSaleGiftAmount(40, "reserved")).toBe(40);
    expect(heldSaleGiftAmount(40, "voided")).toBe(0);
    expect(saleCardAmountStillDue(100, heldSaleGiftAmount(40, "voided"), 0)).toBe(100);
    expect(saleCardAmountStillDue(100, 0, 60)).toBe(40);
    expect(saleChargeMatchesDue(60, 60)).toBe(true);
    expect(saleChargeMatchesDue(10, 60)).toBe(false);
    expect(saleChargeMatchesDue(60, null)).toBe(false);
  });
});

describe("saleGiftCardRejectReason", () => {
  it("rejects an expired or inactive card and a balance that is too small", () => {
    expect(
      saleGiftCardRejectReason(
        { is_active: true, expires_at: "2020-01-01T00:00:00.000Z", balance: 100, currency: "ZAR" },
        40,
        "ZAR",
      ),
    ).toBe("Gift card has expired");
    expect(
      saleGiftCardRejectReason(
        { is_active: false, expires_at: null, balance: 100, currency: "ZAR" },
        40,
        "ZAR",
      ),
    ).toBe("Gift card is inactive");
    expect(
      saleGiftCardRejectReason(
        { is_active: true, expires_at: null, balance: 30, currency: "ZAR" },
        40,
        "ZAR",
      ),
    ).toBe("Insufficient gift card balance");
  });

  it("reserves only the gift-card line, and a gift-only sale only when the gift covers the total", () => {
    expect(
      saleGiftTenderMismatch({
        giftCode: "CARD",
        giftAmount: 40,
        saleTotal: 100,
        legs: [
          { method: "gift_card", amount: 40 },
          { method: "cash", amount: 60 },
        ],
      }),
    ).toBeNull();
    expect(
      saleGiftTenderMismatch({
        giftCode: "CARD",
        giftAmount: 100,
        saleTotal: 100,
        legs: [
          { method: "gift_card", amount: 40 },
          { method: "cash", amount: 60 },
        ],
      }),
    ).toBe("Gift card amount does not match the gift card payment");
    expect(
      saleGiftTenderMismatch({
        giftCode: "CARD",
        giftAmount: 40,
        saleTotal: 100,
        legs: [{ method: "cash", amount: 100 }],
      }),
    ).toBe("Gift card amount does not match the gift card payment");
    expect(
      saleGiftTenderMismatch({
        giftCode: "CARD",
        giftAmount: 40,
        saleTotal: 100,
        legs: null,
      }),
    ).toBe("Gift card amount does not match the gift card payment");
    expect(
      saleGiftTenderMismatch({
        giftCode: "CARD",
        giftAmount: 100,
        saleTotal: 100,
        legs: null,
      }),
    ).toBeNull();
  });

  it("puts a captured sale gift back on the card once when the sale is reversed", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const redemption = { id: "red-1", status: "captured", amount: 40, gift_card_id: "card-1" };
    const supabase = {
      from: (table: string) => {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = vi.fn(self);
        api.eq = vi.fn(self);
        api.in = vi.fn(self);
        api.maybeSingle = vi.fn(async () => {
          if (table === "gift_card_redemptions" && updates.length === 0) {
            return { data: redemption, error: null };
          }
          if (table === "gift_cards" && updates.length === 0) {
            return { data: { id: "card-1", balance: 60 }, error: null };
          }
          return { data: { id: "card-1" }, error: null };
        });
        api.update = vi.fn((payload: Record<string, unknown>) => {
          updates.push({ table, ...payload });
          return api;
        });
        return api;
      },
    };
    await restoreSaleGiftCard(supabase as never, "sale-1");
    expect(updates).toEqual([
      expect.objectContaining({ table: "gift_cards", balance: 100 }),
      expect.objectContaining({ table: "gift_card_redemptions", status: "voided" }),
    ]);
  });

  it("completes a sale after the gift was returned only when card charges cover the total", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "gift_card_redemptions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { status: "voided" }, error: null }),
              }),
            }),
          };
        }
        if (table === "sales") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { total_amount: 100 }, error: null }),
              }),
            }),
          };
        }
        if (table === "provider_yoco_payments") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({
                  data: [{ sale_id: "sale-1", amount: 10000, refund_status: null }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "provider_paycloud_payments") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    await expect(
      settleReservedSaleGiftCard(supabase as never, "sale-1", {
        cardAmount: 100,
        cardAmountAlreadyRecorded: true,
      }),
    ).resolves.toEqual({ ok: true });

    const shortSupabase = {
      ...supabase,
      from: (table: string) => {
        if (table === "provider_yoco_payments") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({
                  data: [{ sale_id: "sale-1", amount: 6000, refund_status: null }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return supabase.from(table);
      },
    };
    await expect(
      settleReservedSaleGiftCard(shortSupabase as never, "sale-1", {
        cardAmount: 60,
        cardAmountAlreadyRecorded: true,
      }),
    ).resolves.toEqual({ ok: false, message: "Gift card was not held for this sale" });
  });

  it("lets a sale with no gift card complete", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    await expect(settleReservedSaleGiftCard(supabase as never, "sale-1")).resolves.toEqual({
      ok: true,
    });
  });

  it("accepts an active card with enough balance in the sale currency", () => {
    expect(
      saleGiftCardRejectReason(
        { is_active: true, expires_at: null, balance: 40, currency: "ZAR" },
        40,
        "zar",
      ),
    ).toBeNull();
  });
});
