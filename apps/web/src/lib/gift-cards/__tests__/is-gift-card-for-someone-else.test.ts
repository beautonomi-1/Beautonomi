import { describe, expect, it } from "vitest";
import { computeIsGiftCardForSomeoneElse } from "../is-gift-card-for-someone-else";

describe("computeIsGiftCardForSomeoneElse", () => {
  it("is false when recipient is the buyer", () => {
    expect(
      computeIsGiftCardForSomeoneElse({
        recipientEmail: "me@example.com",
        userEmail: "me@example.com",
        userRedeemedCard: false,
      }),
    ).toBe(false);
  });

  it("is true when gift was sent to someone else and buyer did not redeem", () => {
    expect(
      computeIsGiftCardForSomeoneElse({
        recipientEmail: "friend@example.com",
        userEmail: "me@example.com",
        userRedeemedCard: false,
      }),
    ).toBe(true);
  });

  it("is false when buyer redeemed the card even if originally for someone else", () => {
    expect(
      computeIsGiftCardForSomeoneElse({
        recipientEmail: "friend@example.com",
        userEmail: "me@example.com",
        userRedeemedCard: true,
      }),
    ).toBe(false);
  });
});
