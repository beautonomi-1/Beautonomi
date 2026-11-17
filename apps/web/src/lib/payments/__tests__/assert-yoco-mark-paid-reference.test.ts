import { describe, expect, it } from "vitest";
import {
  assertYocoMarkPaidReference,
  yocoStoredAmountToMajor,
} from "../assert-yoco-mark-paid-reference";

function supabaseWithRow(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("assertYocoMarkPaidReference (F2-59)", () => {
  it("rejects a reference with no matching Yoco row", async () => {
    const result = await assertYocoMarkPaidReference(supabaseWithRow(null), {
      providerId: "prov-1",
      reference: "yp_fake",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("YOCO_PAYMENT_NOT_FOUND");
  });

  it("rejects a pending Yoco payment", async () => {
    const result = await assertYocoMarkPaidReference(
      supabaseWithRow({
        yoco_payment_id: "yp_1",
        status: "pending",
        amount: 10000,
        currency: "ZAR",
      }),
      { providerId: "prov-1", reference: "yp_1" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("YOCO_PAYMENT_NOT_SUCCESSFUL");
  });

  it("rejects a Yoco payment linked to a different charge", async () => {
    const result = await assertYocoMarkPaidReference(
      supabaseWithRow({
        yoco_payment_id: "yp_1",
        status: "successful",
        amount: 10000,
        currency: "ZAR",
        entity_type: "additional_charge",
        entity_id: "charge-other",
      }),
      {
        providerId: "prov-1",
        reference: "yp_1",
        expectedEntityType: "additional_charge",
        expectedEntityId: "charge-1",
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("YOCO_PAYMENT_ENTITY_MISMATCH");
  });

  it("rejects when the captured amount is short of what is still due", async () => {
    const result = await assertYocoMarkPaidReference(
      supabaseWithRow({
        yoco_payment_id: "yp_1",
        status: "successful",
        amount: 5000,
        currency: "ZAR",
      }),
      { providerId: "prov-1", reference: "yp_1", expectedAmountMajor: 100 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("YOCO_PAYMENT_AMOUNT_MISMATCH");
  });

  it("accepts a successful provider-owned payment (amount in cents)", async () => {
    const result = await assertYocoMarkPaidReference(
      supabaseWithRow({
        yoco_payment_id: "yp_1",
        status: "successful",
        amount: 10000,
        currency: "ZAR",
        entity_type: "additional_charge",
        entity_id: "charge-1",
      }),
      {
        providerId: "prov-1",
        reference: "yp_1",
        expectedEntityType: "additional_charge",
        expectedEntityId: "charge-1",
        expectedAmountMajor: 100,
      },
    );
    expect(result).toEqual({ ok: true, yocoPaymentId: "yp_1", amountMajor: 100 });
  });

  it("allows a larger capture (tip) against the amount due", async () => {
    const result = await assertYocoMarkPaidReference(
      supabaseWithRow({
        yoco_payment_id: "yp_1",
        status: "successful",
        amount: 11500,
        currency: "ZAR",
      }),
      { providerId: "prov-1", reference: "yp_1", expectedAmountMajor: 100 },
    );
    expect(result.ok).toBe(true);
  });

  it("treats stored Yoco amount as cents (F-05)", () => {
    expect(yocoStoredAmountToMajor(10000, "ZAR")).toBe(100);
    expect(yocoStoredAmountToMajor(11500, "ZAR")).toBe(115);
  });
});
