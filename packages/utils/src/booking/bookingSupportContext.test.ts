import { describe, expect, it } from "vitest";
import {
  bookingSupportQuery,
  formatBookingSupportLabel,
  getBookingSupportPrompt,
  resolveBookingSupportTicketPrefill,
  resolveSupportTicketPrefillFromSearch,
  getProductOrderSupportPrompt,
  supportPrefillNoun,
  supportTicketQuery,
  SUPPORT_CONTEXT_LABEL_MAX,
} from "./bookingSupportContext";

describe("formatBookingSupportLabel", () => {
  it("puts the booking number first and keeps the full id", () => {
    expect(
      formatBookingSupportLabel({
        bookingNumber: "BTN-1042",
        bookingId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("BTN-1042 (11111111-1111-4111-8111-111111111111)");
  });

  it("falls back to the id when the number is missing", () => {
    expect(
      formatBookingSupportLabel({
        bookingId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("stays within the ticket label max", () => {
    const label = formatBookingSupportLabel({
      bookingNumber: "BTN-1042",
      bookingId: "11111111-1111-4111-8111-111111111111",
    });
    expect(label.length).toBeLessThanOrEqual(SUPPORT_CONTEXT_LABEL_MAX);
  });
});

describe("bookingSupportQuery", () => {
  it("includes number, id, and category", () => {
    expect(
      bookingSupportQuery({
        bookingId: "11111111-1111-4111-8111-111111111111",
        bookingNumber: "BTN-1042",
        category: "payment_failed_charge",
      }),
    ).toBe(
      "?booking_id=11111111-1111-4111-8111-111111111111&booking_number=BTN-1042&category=payment_failed_charge",
    );
  });
});

describe("resolveBookingSupportTicketPrefill", () => {
  it("sends a uuid as support_context_id and a human label", () => {
    const prefill = resolveBookingSupportTicketPrefill({
      bookingId: "11111111-1111-4111-8111-111111111111",
      bookingNumber: "BTN-1042",
      category: "payment_refund",
    });
    expect(prefill.supportContextType).toBe("booking");
    expect(prefill.supportContextId).toBe("11111111-1111-4111-8111-111111111111");
    expect(prefill.supportContextLabel).toBe("BTN-1042 (11111111-1111-4111-8111-111111111111)");
    expect(prefill.category).toBe("payment_refund");
  });

  it("omits a non-uuid booking id from support_context_id", () => {
    const prefill = resolveBookingSupportTicketPrefill({
      bookingId: "not-a-uuid",
      bookingNumber: "BTN-1042",
    });
    expect(prefill.supportContextId).toBeNull();
    expect(prefill.supportContextLabel).toBe("BTN-1042 (not-a-uuid)");
  });
});

describe("getBookingSupportPrompt", () => {
  it("treats failed payment as urgent", () => {
    const prompt = getBookingSupportPrompt({
      status: "pending_payment",
      paymentStatus: "failed",
      outstandingBalance: 250,
      audience: "customer",
    });
    expect(prompt.prominence).toBe("urgent");
    expect(prompt.category).toBe("payment_failed_charge");
  });

  it("treats stuck pending_payment with a balance as urgent", () => {
    const prompt = getBookingSupportPrompt({
      status: "pending_payment",
      paymentStatus: "pending",
      outstandingBalance: 80,
    });
    expect(prompt.prominence).toBe("urgent");
    expect(prompt.category).toBe("payment_failed_charge");
  });

  it("uses refund category when a cancelled booking was paid", () => {
    const prompt = getBookingSupportPrompt({
      status: "cancelled",
      paymentStatus: "paid",
    });
    expect(prompt.prominence).toBe("urgent");
    expect(prompt.category).toBe("payment_refund");
  });

  it("uses no-show category for customers", () => {
    const prompt = getBookingSupportPrompt({
      status: "no_show",
      audience: "customer",
    });
    expect(prompt.prominence).toBe("urgent");
    expect(prompt.category).toBe("booking_provider_no_show");
  });

  it("always offers a helpful support path", () => {
    const prompt = getBookingSupportPrompt({
      status: "confirmed",
      paymentStatus: "paid",
    });
    expect(prompt.prominence).toBe("helpful");
    expect(prompt.category).toBe("booking_issue");
  });
});

describe("resolveSupportTicketPrefillFromSearch", () => {
  it("prefers a product order when both refs are present", () => {
    const prefill = resolveSupportTicketPrefillFromSearch({
      bookingId: "11111111-1111-4111-8111-111111111111",
      bookingNumber: "BTN-1042",
      orderId: "22222222-2222-4222-8222-222222222222",
      orderNumber: "ORD-88",
      category: "order_status_shipping",
    });
    expect(prefill.supportContextType).toBe("product_order");
    expect(prefill.supportContextId).toBe("22222222-2222-4222-8222-222222222222");
    expect(prefill.supportContextLabel).toContain("ORD-88");
    expect(prefill.category).toBe("order_status_shipping");
  });

  it("prefills a gift card when gift card refs are present", () => {
    const prefill = resolveSupportTicketPrefillFromSearch({
      giftCardId: "33333333-3333-4333-8333-333333333333",
      giftCardCode: "GIFT-9X",
      category: "payment_gift_card",
    });
    expect(prefill.supportContextType).toBe("gift_card");
    expect(prefill.supportContextId).toBe("33333333-3333-4333-8333-333333333333");
    expect(prefill.supportContextLabel).toContain("GIFT-9X");
    expect(prefill.category).toBe("payment_gift_card");
    expect(supportPrefillNoun(prefill.supportContextType)).toBe("gift card");
  });
});

describe("supportTicketQuery", () => {
  it("includes gift card refs", () => {
    expect(
      supportTicketQuery({
        giftCardId: "33333333-3333-4333-8333-333333333333",
        giftCardCode: "GIFT-9X",
        category: "payment_gift_card",
      }),
    ).toBe(
      "?gift_card_id=33333333-3333-4333-8333-333333333333&gift_card_code=GIFT-9X&category=payment_gift_card",
    );
  });
});

describe("getProductOrderSupportPrompt", () => {
  it("uses refund category for cancelled orders", () => {
    const prompt = getProductOrderSupportPrompt({ status: "cancelled", paymentStatus: "paid" });
    expect(prompt.prominence).toBe("urgent");
    expect(prompt.category).toBe("payment_refund");
  });
});
