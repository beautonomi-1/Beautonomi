import { describe, expect, it } from "vitest";
import { redactGatewayPayload } from "../redact-gateway-payload";

describe("redactGatewayPayload (F2-69)", () => {
  it("masks card and customer PII while keeping reconciliation fields", () => {
    const event = {
      id: "evt_1",
      type: "payment.succeeded",
      payload: {
        id: "pay_1",
        amount: 1234,
        currency: "ZAR",
        status: "succeeded",
        metadata: { provider_id: "provider-1", processed_by: "staff-1" },
        card: { number: "4111111111111111", expiryMonth: "12", expiryYear: "2030", last4: "1111", brand: "visa" },
        customer: { email: "jane@example.test", phone: "+27000000000", name: "Jane Test" },
        paymentMethodDetails: { card: { maskedCard: "411111******1111", holderName: "JANE TEST" } },
      },
    };
    const redacted = redactGatewayPayload(event);
    const json = JSON.stringify(redacted);

    expect(redacted.id).toBe("evt_1");
    expect(redacted.payload.id).toBe("pay_1");
    expect(redacted.payload.amount).toBe(1234);
    expect(redacted.payload.currency).toBe("ZAR");
    expect(redacted.payload.metadata).toEqual({ provider_id: "provider-1", processed_by: "staff-1" });

    expect(json).not.toContain("4111111111111111");
    expect(json).not.toContain("jane@example.test");
    expect(json).not.toContain("+27000000000");
    expect(json).not.toContain("Jane Test");
    expect(json).not.toContain("JANE TEST");
    expect(json).not.toContain("2030");
    // Non-identifying card descriptors are preserved.
    expect(redacted.payload.card.last4).toBe("1111");
    expect(redacted.payload.card.brand).toBe("visa");
  });

  it("does not mutate the input and handles primitives", () => {
    const input = { email: "a@b.test", nested: [{ phone: "123" }] };
    const copy = JSON.parse(JSON.stringify(input));
    redactGatewayPayload(input);
    expect(input).toEqual(copy);
    expect(redactGatewayPayload(null)).toBeNull();
    expect(redactGatewayPayload("x")).toBe("x");
  });
});
