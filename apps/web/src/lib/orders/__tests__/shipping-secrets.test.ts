import { afterEach, describe, expect, it } from "vitest";
import { maskSecret, resolveEcommerceShippingEnabled } from "../shipping-secrets";

describe("resolveEcommerceShippingEnabled", () => {
  const original = process.env.ECOMMERCE_SHIPPING_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.ECOMMERCE_SHIPPING_ENABLED;
    else process.env.ECOMMERCE_SHIPPING_ENABLED = original;
  });

  it("stays off when the database flag is false and env is unset", () => {
    delete process.env.ECOMMERCE_SHIPPING_ENABLED;
    expect(resolveEcommerceShippingEnabled(false)).toBe(false);
  });

  it("turns on from the superadmin database flag", () => {
    delete process.env.ECOMMERCE_SHIPPING_ENABLED;
    expect(resolveEcommerceShippingEnabled(true)).toBe(true);
  });

  it("env true enables even if the database flag is off", () => {
    process.env.ECOMMERCE_SHIPPING_ENABLED = "true";
    expect(resolveEcommerceShippingEnabled(false)).toBe(true);
  });

  it("env false is a kill switch over the database flag", () => {
    process.env.ECOMMERCE_SHIPPING_ENABLED = "false";
    expect(resolveEcommerceShippingEnabled(true)).toBe(false);
  });
});

describe("maskSecret", () => {
  it("never returns the live value", () => {
    expect(maskSecret("live-shiplogic-token")).toBe("live...oken");
    expect(maskSecret("live-shiplogic-token")).not.toContain("shiplogic");
    expect(maskSecret("short")).toBe("***");
    expect(maskSecret("")).toBeNull();
  });
});
