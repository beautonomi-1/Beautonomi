import { describe, expect, it } from "vitest";
import {
  existingGiftHoldDecision,
  giftCardBalanceAfterHold,
  holdGiftCardOnBooking,
} from "../hold-gift-card-for-booking";

describe("existingGiftHoldDecision", () => {
  it("creates a hold when the booking has no redemption", () => {
    expect(
      existingGiftHoldDecision({ existingAmount: null, existingStatus: null, requested: 50 }),
    ).toBe("create");
  });

  it("reuses the same held amount", () => {
    expect(
      existingGiftHoldDecision({ existingAmount: 50, existingStatus: "captured", requested: 50 }),
    ).toBe("reuse");
  });

  it("rejects a second amount on the same booking", () => {
    expect(
      existingGiftHoldDecision({ existingAmount: 50, existingStatus: "captured", requested: 80 }),
    ).toBe("reject");
  });
});

describe("giftCardBalanceAfterHold", () => {
  it("subtracts the hold from the card", () => {
    expect(giftCardBalanceAfterHold(100, 40)).toBe(60);
  });

  it("refuses a hold the card cannot cover", () => {
    expect(giftCardBalanceAfterHold(30, 40)).toBeNull();
  });
});

describe("holdGiftCardOnBooking", () => {
  it("reduces the card once and records a reserved redemption", async () => {
    const state = {
      balance: 100,
      redemptions: [] as Array<{ amount: number; status: string }>,
    };
    const admin = {
      from(table: string) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          ilike() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle: async () => {
            if (table === "gift_card_redemptions") {
              return { data: state.redemptions[0] ?? null, error: null };
            }
            return { data: null, error: null };
          },
          then(resolve: (value: unknown) => void) {
            if (table === "gift_cards") {
              resolve({
                data: [
                  {
                    id: "card-1",
                    code: "GIFT50",
                    balance: state.balance,
                    currency: "ZAR",
                    is_active: true,
                    expires_at: null,
                  },
                ],
                error: null,
              });
            }
          },
          update(patch: { balance: number }) {
            const next = patch.balance;
            return {
              eq() {
                return this;
              },
              select: async () => {
                if (table === "gift_cards" && state.balance !== next) {
                  state.balance = next;
                  return { data: [{ id: "card-1" }], error: null };
                }
                return { data: [], error: null };
              },
            };
          },
          insert: async (row: { amount: number; status: string }) => {
            state.redemptions.push(row);
            return { error: null };
          },
        };
      },
    };

    const held = await holdGiftCardOnBooking(admin as never, {
      code: "gift50",
      amount: 40,
      bookingId: "booking-1",
      currency: "ZAR",
      userId: "customer-1",
    });

    expect(held).toEqual({ ok: true, giftCardId: "card-1", amount: 40, alreadyHeld: false });
    expect(state.balance).toBe(60);
    expect(state.redemptions).toEqual([expect.objectContaining({ amount: 40, status: "reserved" })]);
  });
});
