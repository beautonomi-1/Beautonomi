import { describe, expect, it } from "vitest";
import { z } from "zod";

const createPaymentSchema = z.object({
  entity_type: z.enum(["booking", "group_booking", "sale", "product_order", "additional_charge"]),
  channel: z.enum(["cloud", "same_terminal"]).optional().default("cloud"),
});

describe("PayCloud payment create schema", () => {
  it("accepts additional_charge and product_order", () => {
    expect(
      createPaymentSchema.safeParse({ entity_type: "additional_charge" }).success,
    ).toBe(true);
    expect(createPaymentSchema.safeParse({ entity_type: "product_order" }).success).toBe(
      true,
    );
  });

  it("accepts cloud and same_terminal channels", () => {
    expect(createPaymentSchema.safeParse({ entity_type: "booking", channel: "cloud" }).success).toBe(
      true,
    );
    expect(
      createPaymentSchema.safeParse({ entity_type: "booking", channel: "same_terminal" }).success,
    ).toBe(true);
    expect(createPaymentSchema.safeParse({ entity_type: "booking" }).data?.channel).toBe("cloud");
  });

  it("rejects invoice entity type", () => {
    const parsed = createPaymentSchema.safeParse({ entity_type: "invoice" });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid channel", () => {
    expect(
      createPaymentSchema.safeParse({ entity_type: "booking", channel: "intent" }).success,
    ).toBe(false);
  });
});
