import type { FinanceLedgerRow } from "@/lib/admin/finance-ledger-tenant";

/**
 * Single source of truth for admin money metrics from merged `finance_transactions` rows.
 * Matches GET /api/admin/finance/summary aggregation (booking GMV, platform take, subscriptions, ads).
 */
export type FinanceLedgerAggregate = {
  service_collected_gross: number;
  service_collected_net: number;
  gateway_fees_services: number;
  platform_commission_gross: number;
  /** Contra-revenue from refunds that reverse platform-recognized earnings only. */
  platform_refund_contra: number;
  /** @deprecated Use platform_refund_contra. Kept for API compatibility. */
  platform_refund_impact: number;
  platform_commission_net: number;
  platform_take_net: number;
  tips_gross: number;
  taxes_gross: number;
  subscription_net: number;
  subscription_gateway_fees: number;
  subscription_gross: number;
  ads_net: number;
  ads_gateway_fees: number;
  ads_gross: number;
  provider_earnings_net: number;
  gift_card_sales: number;
  membership_sales: number;
  /** Sum of absolute refund amounts for gross operational reporting. */
  refunds_abs_gross: number;
  refunds_gross: number;
  /** Net provider-side refund impact after removing platform contra allocation. */
  provider_refund_net_impact: number;
  /** Wallet credits applied to bookings (wallet-only or split wallet+card payments). */
  wallet_collected: number;
  /** Gift card credits applied to bookings (gift-card-only or split gift-card+card payments). */
  gift_card_collected: number;
  /** Cancellation fees retained by the provider (configured by provider's cancellation policy). */
  cancellation_fees_retained: number;
  /** Total discount value applied via promotion codes (reduces net revenue). */
  promotion_discounts: number;
  /** Gift card liability reduced when gift cards are redeemed (offsets gift_card_sales on balance sheet). */
  gift_card_liability_reductions: number;
  /** Ecommerce product order platform fees (separate from booking commission). */
  ecommerce_platform_fees: number;
  /** Customer-facing service fee revenue (booking add-on). */
  service_fee_revenue: number;
  /** Travel fee pass-through amount. */
  travel_fees: number;
  /** Additional charge revenue (gateway-settled). */
  additional_charge_gross: number;
  /** Net impact from controlled manual finance adjustments. */
  manual_adjustments_net: number;
};

type Row = Pick<FinanceLedgerRow, "transaction_type" | "amount" | "fees" | "net" | "commission">;

function sum(tx: Row[], types: string[], field: "amount" | "fees" | "net" | "commission"): number {
  return tx.filter((r) => types.includes(r.transaction_type ?? "")).reduce((s, r) => s + Number(r[field] ?? 0), 0);
}

function sumFees(tx: Row[], types: string[]): number {
  return tx.filter((r) => types.includes(r.transaction_type ?? "")).reduce((s, r) => s + Number(r.fees ?? 0), 0);
}

function sumAbsoluteAmount(tx: Row[], types: string[]): number {
  return tx
    .filter((r) => types.includes(r.transaction_type ?? ""))
    .reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);
}

export function aggregateFinanceLedgerRows(rows: FinanceLedgerRow[]): FinanceLedgerAggregate {
  const tx = rows as Row[];

  const gatewayFeesServices = sumFees(tx, ["payment", "additional_charge_payment"]);

  // bookingGmv: The full value of services rendered, combining gateway-paid amounts (recorded
  // under "payment") with wallet and gift card credits (recorded under wallet_payment /
  // gift_card_payment). Tip, tax, travel fee, and service fee are additive line items.
  // NOTE: wallet_payment and gift_card_payment are only present for gateway-less (fully covered)
  // bookings. For split wallet+card bookings, wallet_payment is added by process-payment.ts at
  // booking creation and idempotently by charge-success.ts, so do not double-count with "payment".
  const walletCollected = sum(tx, ["wallet_payment"], "amount");
  const giftCardCollected = sum(tx, ["gift_card_payment"], "amount");
  const bookingGmv =
    sum(tx, ["payment"], "amount") +
    walletCollected +
    giftCardCollected +
    sum(tx, ["tip"], "amount") +
    sum(tx, ["tax"], "amount") +
    sum(tx, ["travel_fee"], "amount") +
    sum(tx, ["service_fee"], "amount");
  const additionalChargeGross =
    sum(tx, ["additional_charge_payment"], "amount") + sumFees(tx, ["additional_charge_payment"]);
  const serviceCollectedGross = bookingGmv + additionalChargeGross;
  const serviceCollectedNet = serviceCollectedGross - gatewayFeesServices;

  const cancellationFeesRetained = sum(tx, ["cancellation_fee"], "net");
  const promotionDiscounts = sum(tx, ["promotion_discount"], "amount");
  const giftCardLiabilityReductions = sum(tx, ["gift_card_liability_reduction"], "amount");

  const platformCommissionGross = sum(tx, ["payment", "additional_charge_payment"], "net");
  // Refund rows can represent full customer cash movements; only `commission` (when present)
  // should reverse platform-recognized earnings to avoid overstating platform losses.
  const platformRefundContra = sum(tx, ["refund"], "commission");
  const totalRefundNet = sum(tx, ["refund"], "net");
  const providerRefundNetImpact = totalRefundNet - platformRefundContra;
  // Cancellation fees are provider-retained income (not platform commission).
  // They are tracked separately via `cancellation_fees_retained`.
  const platformCommissionNet = platformCommissionGross + platformRefundContra;
  const manualAdjustmentsNet = sum(tx, ["manual_adjustment"], "net");

  const platformTakeNet = platformCommissionNet - gatewayFeesServices + manualAdjustmentsNet;

  const subscriptionNet = sum(tx, ["provider_subscription_payment"], "net");
  const subscriptionGatewayFees = sumFees(tx, ["provider_subscription_payment"]);
  const subscriptionGross = subscriptionNet + subscriptionGatewayFees;

  const adsNet = sum(tx, ["provider_ads_payment"], "net");
  const adsGatewayFees = sumFees(tx, ["provider_ads_payment"]);
  const adsGross = adsNet + adsGatewayFees;

  return {
    service_collected_gross: serviceCollectedGross,
    service_collected_net: serviceCollectedNet,
    gateway_fees_services: gatewayFeesServices,
    platform_commission_gross: platformCommissionGross,
    platform_refund_contra: platformRefundContra,
    platform_refund_impact: platformRefundContra,
    platform_commission_net: platformCommissionNet,
    platform_take_net: platformTakeNet,
    tips_gross: sum(tx, ["tip"], "amount"),
    taxes_gross: sum(tx, ["tax"], "amount"),
    subscription_net: subscriptionNet,
    subscription_gateway_fees: subscriptionGatewayFees,
    subscription_gross: subscriptionGross,
    ads_net: adsNet,
    ads_gateway_fees: adsGatewayFees,
    ads_gross: adsGross,
    provider_earnings_net: sum(tx, ["provider_earnings"], "net"),
    gift_card_sales: sum(tx, ["gift_card_sale"], "amount"),
    membership_sales: sum(tx, ["membership_sale"], "amount"),
    refunds_abs_gross: sumAbsoluteAmount(tx, ["refund"]),
    refunds_gross: sumAbsoluteAmount(tx, ["refund"]),
    provider_refund_net_impact: providerRefundNetImpact,
    wallet_collected: walletCollected,
    gift_card_collected: giftCardCollected,
    cancellation_fees_retained: cancellationFeesRetained,
    promotion_discounts: promotionDiscounts,
    gift_card_liability_reductions: giftCardLiabilityReductions,
    ecommerce_platform_fees: sum(tx, ["platform_fee"], "amount"),
    service_fee_revenue: sum(tx, ["service_fee"], "amount"),
    travel_fees: sum(tx, ["travel_fee"], "amount"),
    additional_charge_gross: additionalChargeGross,
    manual_adjustments_net: manualAdjustmentsNet,
  };
}
