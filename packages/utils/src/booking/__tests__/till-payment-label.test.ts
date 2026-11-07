import { describe, expect, it } from "vitest";
import {
  tillPaymentKindForBooking,
  tillPaymentLabelForBooking,
  tillPaymentLabelFromRow,
} from "../till-payment-label";

describe("tillPaymentKindForBooking", () => {
  it("returns a translatable kind and skips cashback and non-completed rows", () => {
    expect(
      tillPaymentKindForBooking([
        {
          status: "completed",
          payment_method: "card",
          payment_provider: "yoco",
          created_at: "2026-01-03T00:00:00Z",
          payment_provider_data: { cashback: true },
        },
        {
          status: "pending",
          payment_method: "card",
          payment_provider: "paystack",
          created_at: "2026-01-02T00:00:00Z",
        },
        {
          status: "completed",
          payment_method: "card",
          payment_provider: "paycloud",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
    ).toBe("cardMachine");
  });
});

describe("tillPaymentLabelFromRow", () => {
  it("maps Paystack card to Online", () => {
    expect(
      tillPaymentLabelFromRow({
        status: "completed",
        payment_method: "card",
        payment_provider: "paystack",
      }),
    ).toBe("Online");
  });

  it("maps manual card", () => {
    expect(
      tillPaymentLabelFromRow({
        status: "completed",
        payment_method: "card",
        payment_provider: "other",
      }),
    ).toBe("Manual card");
  });

  it("ignores tip rows when picking latest", () => {
    expect(
      tillPaymentLabelForBooking([
        {
          status: "completed",
          payment_method: "cash",
          payment_provider: "cash",
          created_at: "2026-01-02T00:00:00Z",
          payment_provider_data: { tip: true },
        },
        {
          status: "completed",
          payment_method: "cash",
          payment_provider: "cash",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
    ).toBe("Cash");
  });
});
