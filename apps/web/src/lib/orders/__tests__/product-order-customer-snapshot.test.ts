import { describe, expect, it } from "vitest";
import {
  productOrderDisplayCustomerEmail,
  productOrderDisplayCustomerName,
  productOrderDisplayCustomerPhone,
} from "../product-order-customer-snapshot";

describe("product order customer snapshot display", () => {
  it("uses snapshot columns when the user embed is empty", () => {
    const order = {
      customer: null,
      customer_name: "Amina",
      customer_email: "amina@example.com",
      customer_phone: "+27110000000",
    };
    expect(productOrderDisplayCustomerName(order)).toBe("Amina");
    expect(productOrderDisplayCustomerEmail(order)).toBe("amina@example.com");
    expect(productOrderDisplayCustomerPhone(order)).toBe("+27110000000");
  });

  it("prefers snapshot columns over a later user embed", () => {
    const order = {
      customer: { full_name: "Other", email: "other@example.com", phone: "+27000000000" },
      customer_name: "Amina",
      customer_email: "amina@example.com",
      customer_phone: "+27110000000",
    };
    expect(productOrderDisplayCustomerName(order)).toBe("Amina");
    expect(productOrderDisplayCustomerEmail(order)).toBe("amina@example.com");
    expect(productOrderDisplayCustomerPhone(order)).toBe("+27110000000");
  });
});
