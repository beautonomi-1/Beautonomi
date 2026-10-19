import { describe, expect, it } from "vitest";
import { posPaymentEntityFromCreateResponse } from "../pos-payment-entity-from-create-response";

describe("posPaymentEntityFromCreateResponse", () => {
  it("collects against the product order after a migrated walk-in sale", () => {
    expect(
      posPaymentEntityFromCreateResponse({
        id: "sale-legacy",
        migrated_to_product_order: true,
        product_order_id: "order-1",
      }),
    ).toEqual({ entityType: "product_order", entityId: "order-1" });
  });

  it("keeps sale when the row was not migrated", () => {
    expect(posPaymentEntityFromCreateResponse({ id: "sale-1" })).toEqual({
      entityType: "sale",
      entityId: "sale-1",
    });
  });
});
