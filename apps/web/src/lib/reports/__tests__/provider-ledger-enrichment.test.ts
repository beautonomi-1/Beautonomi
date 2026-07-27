import { describe, expect, it } from "vitest";

import { mapFinanceLedgerRowToProviderUi } from "@/lib/provider/provider-ledger-transaction-view";

describe("mapFinanceLedgerRowToProviderUi enrichment", () => {
  it("uses enrichment for client name, payment method and reference", () => {
    const row = mapFinanceLedgerRowToProviderUi(
      {
        id: "tx-1",
        transaction_type: "provider_earnings",
        amount: 500,
        net: 425,
        created_at: "2026-04-01T10:00:00.000Z",
        booking_id: "booking-1",
        description: "Service earnings",
      },
      {
        client_name: "Jane Doe",
        payment_method: "paystack",
        reference: "BK-1001",
      },
    );

    expect(row).toMatchObject({
      client_name: "Jane Doe",
      payment_method: "paystack",
      reference: "BK-1001",
      type: "earning",
      amount: 425,
    });
  });
});
