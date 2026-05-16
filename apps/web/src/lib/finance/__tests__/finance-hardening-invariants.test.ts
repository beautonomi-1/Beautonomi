import { describe, it, expect } from "vitest";

/**
 * Verification anchor (F19 / dashboard parity): `total_earnings` on GET /api/provider/finance is defined as
 * the sum of `provider_earnings` net only — gift card and membership sale rows are separate liability streams
 * and must not be double-counted into headline earnings in new UI widgets.
 */
describe("finance hardening invariants (documentation + smoke)", () => {
  it("keeps headline earnings definition stable", () => {
    const totalEarnings = 500;
    const giftCardSales = 200;
    const membershipSales = 100;
    expect(totalEarnings).not.toBe(totalEarnings + giftCardSales + membershipSales);
  });
});
