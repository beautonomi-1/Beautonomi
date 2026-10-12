import { describe, expect, it } from "vitest";
import { missingOnlineChargeLedgerPayloadSchema } from "@/lib/finance/ledger-repair";

describe("ledger repair taxonomy", () => {
  it("accepts flutterwave as paymentProvider on missing_online_charge_ledger payloads", () => {
    const parsed = missingOnlineChargeLedgerPayloadSchema.safeParse({
      bookingId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      reference: "flw_tx_ref_1",
      amountMajor: 100,
      fees: 2.5,
      paymentProvider: "flutterwave",
    });
    expect(parsed.success).toBe(true);
  });
});
