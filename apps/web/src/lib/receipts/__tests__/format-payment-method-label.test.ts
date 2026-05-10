import { describe, it, expect } from "vitest";
import { formatPaymentMethodLabel } from "../pdf-design";

/**
 * §Finance-truth 2026-05: receipt PDFs render one row per booking_payments
 * row. The label must be unambiguous to customers and providers — wallet,
 * gift card, cash, EFT (bank_transfer), Yoco card, manual card, and other.
 */
describe("formatPaymentMethodLabel", () => {
  it("wallet (regardless of provider casing)", () => {
    expect(formatPaymentMethodLabel("wallet", "wallet")).toBe("Wallet");
    expect(formatPaymentMethodLabel("wallet", null)).toBe("Wallet");
    expect(formatPaymentMethodLabel("WALLET", "WALLET")).toBe("Wallet");
  });

  it("gift card", () => {
    expect(formatPaymentMethodLabel("gift_card", "gift_card")).toBe("Gift card");
    expect(formatPaymentMethodLabel("gift_card", null)).toBe("Gift card");
  });

  it("cash", () => {
    expect(formatPaymentMethodLabel("cash", "cash")).toBe("Cash");
  });

  it("bank_transfer renders as EFT", () => {
    expect(formatPaymentMethodLabel("bank_transfer", "other")).toBe("EFT");
    expect(formatPaymentMethodLabel("bank_transfer", null)).toBe("EFT");
  });

  it("card with Yoco provider", () => {
    expect(formatPaymentMethodLabel("card", "yoco")).toBe("Card (Yoco)");
  });

  it("card with paystack/stripe/flutterwave shows generic Card", () => {
    expect(formatPaymentMethodLabel("card", "paystack")).toBe("Card");
    expect(formatPaymentMethodLabel("card", "stripe")).toBe("Card");
    expect(formatPaymentMethodLabel("card", "flutterwave")).toBe("Card");
  });

  it("card with 'other' provider is manual card", () => {
    expect(formatPaymentMethodLabel("card", "other")).toBe("Card (manual)");
  });

  it("saved_card / new_card both render as Card", () => {
    expect(formatPaymentMethodLabel("saved_card", "paystack")).toBe("Card");
    expect(formatPaymentMethodLabel("new_card", "paystack")).toBe("Card");
  });

  it("other with provider context", () => {
    expect(formatPaymentMethodLabel("other", "snapscan")).toBe("Other (snapscan)");
    expect(formatPaymentMethodLabel("other", null)).toBe("Other");
  });

  it("unknown method falls back to its raw name", () => {
    expect(formatPaymentMethodLabel("crypto", null)).toBe("crypto");
  });

  it("null/undefined inputs render a safe fallback", () => {
    expect(formatPaymentMethodLabel(null, null)).toBe("Payment");
    expect(formatPaymentMethodLabel(undefined, undefined)).toBe("Payment");
  });
});
