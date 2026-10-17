import { describe, expect, it } from "vitest";
import { deriveSupportContextTypeForTicket } from "../ticket-categories";

describe("deriveSupportContextTypeForTicket", () => {
  it("uses catalog context when there is no reference", () => {
    expect(
      deriveSupportContextTypeForTicket({
        category: "payment_gift_card",
        supportContextId: null,
        supportContextLabel: "",
        clientContextType: "booking",
      }),
    ).toBe("gift_card");
  });

  it("keeps client context when a reference is present", () => {
    expect(
      deriveSupportContextTypeForTicket({
        category: "booking_issue",
        supportContextId: "11111111-1111-4111-8111-111111111111",
        supportContextLabel: "BTN-1",
        clientContextType: "booking",
      }),
    ).toBe("booking");
  });

  it("derives from category when only a free-text reference is provided", () => {
    expect(
      deriveSupportContextTypeForTicket({
        category: "order_status_shipping",
        supportContextId: null,
        supportContextLabel: "ORD-99",
        clientContextType: null,
      }),
    ).toBe("product_order");
  });
});
