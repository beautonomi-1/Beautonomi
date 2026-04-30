import { describe, expect, it } from "vitest";
import { aggregateFinanceLedgerRows } from "./aggregate-finance-ledger-rows";
import type { FinanceLedgerRow } from "./finance-ledger-tenant";

describe("aggregateFinanceLedgerRows", () => {
  it("attributes booking platform fees as platform revenue and keeps ecommerce fees separate", () => {
    const rows: FinanceLedgerRow[] = [
      {
        id: "legacy-booking-fee",
        booking_id: "booking-1",
        transaction_type: "service_fee",
        amount: 12,
        net: 12,
      },
      {
        id: "new-booking-fee",
        booking_id: "booking-2",
        transaction_type: "platform_fee",
        amount: 8,
        net: 8,
      },
      {
        id: "order-fee",
        product_order_id: "order-1",
        transaction_type: "platform_fee",
        amount: 5,
        net: 5,
      },
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.platform_fee_revenue).toBe(20);
    expect(agg.service_fee_revenue).toBe(20);
    expect(agg.ecommerce_platform_fees).toBe(5);
    expect(agg.service_collected_gross).toBe(20);
  });

  it("splits refund impact between platform contra and provider refund impact", () => {
    const rows: FinanceLedgerRow[] = [
      {
        id: "order-refund",
        product_order_id: "order-1",
        transaction_type: "refund",
        amount: 100,
        net: -100,
        commission: -10,
      },
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.platform_refund_contra).toBe(-10);
    expect(agg.platform_commission_net).toBe(-10);
    expect(agg.provider_refund_net_impact).toBe(-90);
    expect(agg.refunds_gross).toBe(100);
  });
});
