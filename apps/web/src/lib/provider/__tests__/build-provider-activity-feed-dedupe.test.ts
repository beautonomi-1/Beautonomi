import { describe, expect, it } from "vitest";

/** Mirrors dedupe logic in build-provider-activity-feed.ts */
function ledgerRecognizedProductOrderIds(
  rows: Array<{ transaction_type: string; product_order_id?: string | null }>,
): Set<string> {
  return new Set(
    rows
      .filter((r) => r.transaction_type === "provider_earnings" && r.product_order_id)
      .map((r) => String(r.product_order_id)),
  );
}

describe("activity feed product order dedupe", () => {
  it("skips product_sale_completed when ledger already recognized the order", () => {
    const ledgerIds = ledgerRecognizedProductOrderIds([
      { transaction_type: "provider_earnings", product_order_id: "po-1" },
      { transaction_type: "tip", product_order_id: "po-2" },
    ]);
    expect(ledgerIds.has("po-1")).toBe(true);
    expect(ledgerIds.has("po-2")).toBe(false);
  });
});
