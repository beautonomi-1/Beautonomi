import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromMinorUnits } from "@beautonomi/utils";

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

describe("Yoco create-payment amount_cents (F2-36)", () => {
  it("converts integer cents with fromMinorUnits, not /100", () => {
    expect(fromMinorUnits(11500, "ZAR")).toBe(115);
    const src = readFileSync(
      join(process.cwd(), "src/app/api/provider/yoco/payments/route.ts"),
      "utf8",
    );
    expect(src).toMatch(/fromMinorUnits\(validationResult\.data\.amount_cents/);
    expect(src).not.toMatch(/amount_cents \/ 100/);
  });
});
