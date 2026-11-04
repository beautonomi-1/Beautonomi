import { describe, expect, it } from "vitest";
import { additionalChargeMixedTenderLedger } from "@/lib/bookings/settle-additional-charge-without-paystack";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";
import type { FinanceLedgerRow } from "@/lib/admin/finance-ledger-tenant";
import {
  computeDashboardEarningsMix,
  computeProviderRevenueBreakdown,
} from "@/lib/reports/provider-revenue-semantics";

describe("additional charge mixed tender ledger", () => {
  it("keeps platform-held wallet in payout earnings and till cash in the walk-in row", () => {
    const ledger = additionalChargeMixedTenderLedger({
      held: 40,
      remainder: 60,
      commissionRatePercent: 10,
    });

    expect(ledger).toMatchObject({
      commission: 4,
      providerEarnings: 36,
      paymentAmount: 40,
      paymentNet: 4,
      walkInAmount: 60,
      walkInNet: 60,
    });

    const rows: Array<FinanceLedgerRow & { description: string }> = [
      {
        id: "pay",
        booking_id: "b1",
        transaction_type: "payment",
        amount: ledger.paymentAmount,
        commission: ledger.commission,
        net: ledger.paymentNet,
        description: "Additional charge charge-1 wallet and gift card",
      },
      {
        id: "earn",
        booking_id: "b1",
        transaction_type: "provider_earnings",
        amount: ledger.providerEarnings,
        net: ledger.providerEarnings,
        description: "Provider earnings (additional charge, wallet/gift) (charge-1)",
      },
      {
        id: "walk",
        booking_id: "b1",
        transaction_type: "walk_in_additional_charge",
        amount: ledger.walkInAmount,
        net: ledger.walkInNet,
        description: "Walk-in additional charge charge-1: Add-on",
      },
    ];

    const revenue = computeProviderRevenueBreakdown(rows);
    expect(revenue.recognizedRevenue).toBe(96);
    expect(revenue.serviceEarnings).toBe(36);
    expect(revenue.walkInAdditionalCharges).toBe(60);

    const mix = computeDashboardEarningsMix(rows);
    expect(mix.additionalChargeEarningsTotal).toBe(96);
    expect(mix.serviceEarningsTotal).toBe(0);

    const admin = aggregateFinanceLedgerRows(rows);
    expect(admin.platform_commission_gross).toBe(4);
    expect(admin.walk_in_additional_charges).toBe(60);
    expect(admin.provider_recognized_revenue_gross).toBe(96);
  });
});
