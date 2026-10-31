import { describe, expect, it } from "vitest";
import { walletCreditMaxForRow } from "./refundUiHelpers";

describe("walletCreditMaxForRow", () => {
  it("uses wallet_remaining_refundable when not a substitute row", () => {
    expect(
      walletCreditMaxForRow({
        remaining_refundable: 110,
        wallet_remaining_refundable: 50,
        is_wallet_substitute_allowed: false,
      }),
    ).toBe(50);
  });
});
