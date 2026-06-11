/**
 * Scenario coverage for `aggregateFinanceLedgerRows` — the canonical reducer that
 * powers admin finance summary, dashboards, and revenue cards.
 *
 * Each scenario codifies a non-negotiable accounting definition from
 * docs/MANUAL_FINANCE_VALIDATION.md so that semantic regressions in
 * platform_take_net, provider_earnings_net, refund splits, GMV, etc. fail loud.
 */
import { describe, expect, it } from "vitest";
import { aggregateFinanceLedgerRows } from "../aggregate-finance-ledger-rows";
import type { FinanceLedgerRow } from "../finance-ledger-tenant";

function row(partial: Partial<FinanceLedgerRow> & { transaction_type: string }): FinanceLedgerRow {
  return {
    id: partial.id ?? `${partial.transaction_type}-${Math.random().toString(36).slice(2, 8)}`,
    booking_id: partial.booking_id,
    product_order_id: partial.product_order_id,
    provider_id: partial.provider_id,
    transaction_type: partial.transaction_type,
    amount: partial.amount ?? 0,
    fees: partial.fees ?? 0,
    commission: partial.commission ?? 0,
    net: partial.net ?? partial.amount ?? 0,
    created_at: partial.created_at ?? "2026-04-01T00:00:00.000Z",
  };
}

describe("aggregateFinanceLedgerRows — admin finance scenarios", () => {
  it("does not double-count GMV for new wallet+card splits where the payment row already includes the wallet portion", () => {
    /** New flow: webhook writes ONE `payment` row whose `amount` = commissionBase
     *  (post-platform-fee, pre-tip/tax/travel). Wallet/gift audit rows exist for
     *  transparency but must not be added on top of `payment.amount`. */
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 200, net: 20, fees: 4, commission: 20 }),
      row({ booking_id: "b1", transaction_type: "wallet_payment", amount: 50 }),
      row({ booking_id: "b1", transaction_type: "platform_fee", amount: 20 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    /** Service collected gross = payment 200 + platform_fee 20 (booking GMV). */
    expect(agg.service_collected_gross).toBe(220);
    expect(agg.wallet_collected).toBe(50);
    expect(agg.gateway_fees_services).toBe(4);
    expect(agg.platform_fee_revenue).toBe(20);
  });

  it("includes tips, taxes, travel, and platform fees inside booking GMV", () => {
    /** payment.amount = commissionBase (100), payment.net = platform commission (10). */
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 100, net: 10, fees: 2, commission: 10 }),
      row({ booking_id: "b1", transaction_type: "tip", amount: 15 }),
      row({ booking_id: "b1", transaction_type: "tax", amount: 8 }),
      row({ booking_id: "b1", transaction_type: "travel_fee", amount: 25 }),
      row({ booking_id: "b1", transaction_type: "platform_fee", amount: 12 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    /** 100 (payment.amount = commissionBase) + 15 + 8 + 25 + 12 = 160. */
    expect(agg.service_collected_gross).toBe(160);
    expect(agg.tips_gross).toBe(15);
    expect(agg.taxes_gross).toBe(8);
    expect(agg.travel_fees).toBe(25);
    expect(agg.platform_fee_revenue).toBe(12);
  });

  it("isolates ecommerce platform fees from booking platform fees", () => {
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "platform_fee", amount: 10 }),
      row({ booking_id: "b2", transaction_type: "service_fee", amount: 5 }),
      row({ product_order_id: "o1", transaction_type: "platform_fee", amount: 7 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.platform_fee_revenue).toBe(15);
    expect(agg.service_fee_revenue).toBe(15);
    expect(agg.ecommerce_platform_fees).toBe(7);
  });

  it("splits refunds: commission column reverses platform contra; rest hits provider impact", () => {
    /** Schema note: on `payment` finance rows, `net` stores the platform commission
     *  (see webhook charge-success.ts ~ line 583). Refund rows carry the platform
     *  contra reversal in their `commission` column; remaining `net` belongs to
     *  the provider's refund impact. */
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 100, net: 10, fees: 2, commission: 10 }),
      row({ booking_id: "b1", transaction_type: "refund", amount: 100, net: -100, commission: -10 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.platform_refund_contra).toBe(-10);
    /** Gross 10 (from payment.net) - 10 contra = 0. */
    expect(agg.platform_commission_net).toBe(0);
    /** Provider impact counts only provider-earnings refund legs (legacy row = full clawback). */
    expect(agg.provider_refund_net_impact).toBe(-100);
    expect(agg.refunds_abs_gross).toBe(100);
    expect(agg.refunds_gross).toBe(100);
  });

  it("isolates subscriptions and ads from service revenue and surfaces gross + net + gateway fees", () => {
    const rows: FinanceLedgerRow[] = [
      row({ transaction_type: "provider_subscription_payment", amount: 199, net: 180, fees: 19 }),
      row({ transaction_type: "provider_ads_payment", amount: 50, net: 47, fees: 3 }),
      row({ booking_id: "b1", transaction_type: "payment", amount: 100, net: 10, fees: 2, commission: 10 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.subscription_net).toBe(180);
    expect(agg.subscription_gateway_fees).toBe(19);
    expect(agg.subscription_gross).toBe(199);
    expect(agg.ads_net).toBe(47);
    expect(agg.ads_gateway_fees).toBe(3);
    expect(agg.ads_gross).toBe(50);
    /** Service revenue is just from booking payment + booking-level tax/tip/travel/platform_fee. */
    expect(agg.service_collected_gross).toBe(100);
  });

  it("treats manual_adjustment as platform_take_net contributor (positive or negative)", () => {
    /** payment.net = platform commission (10). gateway_fees = 2 from payment.fees. */
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 100, net: 10, fees: 2, commission: 10 }),
      row({ transaction_type: "manual_adjustment", amount: 25, net: 25 }),
      row({ transaction_type: "manual_adjustment", amount: -10, net: -10 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.manual_adjustments_net).toBe(15);
    /** platform_take_net = commission_net - gateway_fees + manual_adjustments = 10 - 2 + 15. */
    expect(agg.platform_take_net).toBe(23);
  });

  it("attributes cancellation fees to providers (retained), not platform commission", () => {
    /** payment.net stores the platform commission portion (10) for this booking. */
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 100, net: 10, fees: 2, commission: 10 }),
      row({ booking_id: "b1", transaction_type: "cancellation_fee", amount: 50, net: 50 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.cancellation_fees_retained).toBe(50);
    /** cancellation_fees_retained is reported separately and never folded into platform_commission_net. */
    expect(agg.platform_commission_net).toBe(10);
  });

  it("passes promotion discounts through as a separate counter so net revenue rollups can subtract them", () => {
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "payment", amount: 80, net: 8, commission: 8, fees: 0 }),
      row({ booking_id: "b1", transaction_type: "promotion_discount", amount: 20 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.promotion_discounts).toBe(20);
    /** Promotion discount does NOT affect service_collected_gross — that's already net of promo. */
    expect(agg.service_collected_gross).toBe(80);
  });

  it("counts gift_card_sale and membership_sale via amount, not net", () => {
    const rows: FinanceLedgerRow[] = [
      row({ transaction_type: "gift_card_sale", amount: 500, net: 460, fees: 40 }),
      row({ transaction_type: "membership_sale", amount: 200, net: 180, fees: 20 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.gift_card_sales).toBe(500);
    expect(agg.membership_sales).toBe(200);
  });

  it("tracks gift_card_liability_reduction so balance-sheet rollforward against gift_card_sales is computable", () => {
    const rows: FinanceLedgerRow[] = [
      row({ transaction_type: "gift_card_sale", amount: 500 }),
      row({ booking_id: "b1", transaction_type: "gift_card_liability_reduction", amount: 120 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.gift_card_sales).toBe(500);
    expect(agg.gift_card_liability_reductions).toBe(120);
  });

  it("returns provider_earnings_net using `net` (post-commission, post-refund reversal)", () => {
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "provider_earnings", amount: 100, net: 90 }),
      row({ booking_id: "b2", transaction_type: "provider_earnings", amount: 60, net: 54 }),
      /** Negative provider_earnings (refund reversal) should reduce net. */
      row({ booking_id: "b1", transaction_type: "provider_earnings", amount: -100, net: -90 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.provider_earnings_net).toBe(54);
  });

  it("computes additional_charge_gross from amount + fees so net stays consistent", () => {
    const rows: FinanceLedgerRow[] = [
      row({ booking_id: "b1", transaction_type: "additional_charge_payment", amount: 50, net: 47, fees: 3 }),
    ];

    const agg = aggregateFinanceLedgerRows(rows);

    expect(agg.additional_charge_gross).toBe(53);
    /** Booking GMV stays at 0 (no payment row) but additional charges are surfaced. */
    expect(agg.service_collected_gross).toBe(53);
  });
});
