import { describe, expect, it } from "vitest";
import { computeLeadCancellationAmounts } from "../compute-lead-cancellation-amounts";

describe("computeLeadCancellationAmounts", () => {
  it("subtracts guest shares from lead wallet and fee cap", () => {
    const lead = computeLeadCancellationAmounts({
      platformCollected: 300,
      guestSharesHeld: 100,
      feeRetained: 50,
      walletRefund: 250,
    });
    expect(lead.guestSharesHeld).toBe(100);
    expect(lead.leadFeeRetained).toBe(50);
    expect(lead.leadWalletRefund).toBe(150);
  });

  it("unchanged when no guest shares", () => {
    const lead = computeLeadCancellationAmounts({
      platformCollected: 200,
      guestSharesHeld: 0,
      feeRetained: 40,
      walletRefund: 160,
    });
    expect(lead.leadWalletRefund).toBe(160);
    expect(lead.leadFeeRetained).toBe(40);
  });
});
