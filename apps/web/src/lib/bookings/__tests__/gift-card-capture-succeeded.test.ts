import { describe, expect, it } from "vitest";
import { bookingGiftVoidOutcome, giftCardCaptureAnswer, giftCardCaptureSucceeded, spentGiftReturnAmount } from "../gift-value-still-due";

describe("giftCardCaptureAnswer", () => {
  it("clears the gift only when the capture says nothing was reserved", () => {
    expect(giftCardCaptureAnswer(true)).toBe("taken");
    expect(giftCardCaptureAnswer(false)).toBe("absent");
    expect(giftCardCaptureAnswer(null)).toBe("unknown");
    expect(giftCardCaptureAnswer(undefined)).toBe("unknown");
  });
});

describe("giftCardCaptureSucceeded", () => {
  it("counts the gift only when the capture confirms it was taken", () => {
    expect(giftCardCaptureSucceeded(true)).toBe(true);
    expect(giftCardCaptureSucceeded(false)).toBe(false);
    expect(giftCardCaptureSucceeded(null)).toBe(false);
    expect(giftCardCaptureSucceeded(undefined)).toBe(false);
  });
});

describe("bookingGiftVoidOutcome", () => {
  it("restores only on true, treats false as a gift that was not released, and leaves a missing answer open", () => {
    expect(bookingGiftVoidOutcome(true)).toBe("restored");
    expect(bookingGiftVoidOutcome(false)).toBe("spent");
    expect(bookingGiftVoidOutcome(null)).toBe("unknown");
    expect(bookingGiftVoidOutcome(undefined)).toBe("unknown");
  });
});

describe("spentGiftReturnAmount", () => {
  it("pays the marked amount, and pays the gift still on a closed visit", () => {
    expect(spentGiftReturnAmount(40, 10, false)).toBe(40);
    expect(spentGiftReturnAmount(null, 25, true)).toBe(25);
    expect(spentGiftReturnAmount(0, 25, true)).toBe(25);
    expect(spentGiftReturnAmount(null, 25, false)).toBe(0);
    expect(spentGiftReturnAmount(null, 0, true)).toBe(0);
  });
});
