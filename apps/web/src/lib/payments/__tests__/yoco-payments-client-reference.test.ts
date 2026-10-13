import { describe, expect, it } from "vitest";

/**
 * Documents stable client_reference precedence for Yoco Web POS idempotency
 * (must match apps/web/src/app/api/provider/yoco/payments/route.ts).
 */
function resolveClientReference(input: {
  appointmentId?: string | null;
  productOrderId?: string | null;
  additionalChargeId?: string | null;
  groupBookingId?: string | null;
  saleId?: string | null;
  fallbackUuid: string;
}): string {
  return (
    input.appointmentId ||
    input.productOrderId ||
    input.additionalChargeId ||
    input.groupBookingId ||
    input.saleId ||
    input.fallbackUuid
  );
}

describe("Yoco client_reference precedence", () => {
  it("prefers booking over product order", () => {
    expect(
      resolveClientReference({
        appointmentId: "b-1",
        productOrderId: "po-1",
        fallbackUuid: "u",
      }),
    ).toBe("b-1");
  });

  it("uses product order when no booking", () => {
    expect(
      resolveClientReference({
        productOrderId: "po-1",
        fallbackUuid: "u",
      }),
    ).toBe("po-1");
  });

  it("uses additional charge and group booking before sale", () => {
    expect(
      resolveClientReference({
        additionalChargeId: "c-1",
        saleId: "s-1",
        fallbackUuid: "u",
      }),
    ).toBe("c-1");
    expect(
      resolveClientReference({
        groupBookingId: "g-1",
        saleId: "s-1",
        fallbackUuid: "u",
      }),
    ).toBe("g-1");
  });
});
