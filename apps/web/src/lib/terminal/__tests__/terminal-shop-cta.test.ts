import { describe, expect, it } from "vitest";
import {
  canConfirmTerminalCheckout,
  parseHighlightedOrderId,
  resolveTerminalShopOrderCta,
} from "../terminal-shop-cta";

describe("resolveTerminalShopOrderCta", () => {
  it("returns order when ecommerce is on and product is in stock", () => {
    expect(
      resolveTerminalShopOrderCta({
        ecommerceEnabled: true,
        stockStatus: "in_stock",
        checkoutOptionsCount: 1,
        isOwner: true,
      }),
    ).toEqual({ kind: "order", enabled: true });
  });

  it("returns checkout_disabled when catalog-only", () => {
    const cta = resolveTerminalShopOrderCta({
      ecommerceEnabled: false,
      stockStatus: "in_stock",
      checkoutOptionsCount: 1,
    });
    expect(cta.enabled).toBe(false);
    expect(cta.kind).toBe("checkout_disabled");
  });

  it("returns staff_restricted for non-owners", () => {
    const cta = resolveTerminalShopOrderCta({
      ecommerceEnabled: true,
      stockStatus: "in_stock",
      checkoutOptionsCount: 1,
      isOwner: false,
    });
    expect(cta.kind).toBe("staff_restricted");
  });

  it("returns no_options when checkout options are empty", () => {
    const cta = resolveTerminalShopOrderCta({
      ecommerceEnabled: true,
      stockStatus: "in_stock",
      checkoutOptionsCount: 0,
    });
    expect(cta.kind).toBe("no_options");
  });
});

describe("parseHighlightedOrderId", () => {
  it("prefers order param", () => {
    expect(parseHighlightedOrderId({ get: (k) => (k === "order" ? "abc" : null) })).toBe("abc");
  });

  it("falls back to order_id", () => {
    expect(
      parseHighlightedOrderId({
        get: (k) => (k === "order_id" ? "xyz" : null),
      }),
    ).toBe("xyz");
  });
});

describe("canConfirmTerminalCheckout", () => {
  it("blocks empty checkout options", () => {
    expect(
      canConfirmTerminalCheckout({
        selectedOption: null,
        checkoutOptionsCount: 0,
        fulfillmentType: "courier",
        collectionLocationsCount: 0,
        collectionLocationId: "",
        addressLine1: "",
        city: "",
        postalCode: "",
      }).ok,
    ).toBe(false);
  });

  it("requires courier address fields", () => {
    expect(
      canConfirmTerminalCheckout({
        selectedOption: { commercial_model: "once_off_purchase" },
        checkoutOptionsCount: 1,
        fulfillmentType: "courier",
        collectionLocationsCount: 0,
        collectionLocationId: "",
        addressLine1: "1 Main",
        city: "Cape Town",
        postalCode: "8001",
      }).ok,
    ).toBe(true);
  });
});
