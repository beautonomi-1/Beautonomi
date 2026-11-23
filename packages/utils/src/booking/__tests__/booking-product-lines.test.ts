import { describe, expect, it } from "vitest";
import {
  bookingAddonLineLabel,
  bookingProductLineLabel,
  collectBookingAddonLines,
  collectBookingProductLines,
} from "../booking-product-lines";

describe("collectBookingProductLines", () => {
  it("reads a checkout product stored on booking_products and mapped as products", () => {
    const lines = collectBookingProductLines({
      subtotal: 210,
      products: [{ id: "p1", product_name: "Juice", quantity: 1, unit_price: 150, total_price: 150 }],
      booking_products: [{ id: "raw", products: { name: "Juice" }, quantity: 1, total_price: 150 }],
    });
    expect(lines).toEqual([
      { id: "p1", name: "Juice", variantLabel: "", quantity: 1, unitPrice: 150, totalPrice: 150 },
    ]);
    expect(bookingProductLineLabel(lines[0]!)).toBe("Juice");
  });

  it("labels a variant from the embed when the mapped name is only the product", () => {
    const lines = collectBookingProductLines({
      booking_products: [
        {
          id: "bp1",
          quantity: 2,
          unit_price: "300",
          products: { name: "Aurora Botanica Oil Serum" },
          product_variant: { option_values: { Size: "200ml" } },
        },
      ],
    });
    expect(lines[0]).toMatchObject({
      name: "Aurora Botanica Oil Serum",
      variantLabel: "200ml",
      quantity: 2,
      unitPrice: 300,
      totalPrice: 600,
    });
    expect(bookingProductLineLabel(lines[0]!)).toBe("Aurora Botanica Oil Serum · 200ml ×2");
  });

  it("does not repeat a variant already baked into product_name", () => {
    const lines = collectBookingProductLines({
      products: [
        {
          id: "p1",
          product_name: "Aurora Botanica Oil Serum · 200ml",
          quantity: 1,
          total_price: 300,
          product_variant: { option_values: { Size: "200ml" } },
        },
      ],
    });
    expect(bookingProductLineLabel(lines[0]!)).toBe("Aurora Botanica Oil Serum · 200ml");
  });

  it("reads group retail JSON when the booking has no booking_products", () => {
    const lines = collectBookingProductLines({
      products: [],
      group_bookings: { products: [{ productName: "Oil", quantity: 1, unitPrice: 80, total: 80 }] },
    });
    expect(lines[0]).toMatchObject({ name: "Oil", totalPrice: 80, unitPrice: 80 });
  });
});

describe("collectBookingAddonLines", () => {
  it("prices an add-on as unit price times quantity", () => {
    const lines = collectBookingAddonLines({
      booking_addons: [{ id: "a1", addon_name: "Cuticle oil", quantity: 2, price: 15 }],
    });
    expect(lines[0]).toMatchObject({ name: "Cuticle oil", quantity: 2, totalPrice: 30 });
    expect(bookingAddonLineLabel(lines[0]!)).toBe("Cuticle oil ×2");
  });
});
