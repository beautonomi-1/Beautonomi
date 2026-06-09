import type { FinanceLedgerRow } from "@/lib/admin/finance-ledger-tenant";
import { isCashRefundComponent } from "@/lib/ledger/refund-components";

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
  /** Ecommerce product order platform fees (separate from booking platform fees). */
  ecommerce_platform_fees: number;
  /** Customer-paid booking platform fee revenue. */
  platform_fee_revenue: number;
  /** @deprecated Legacy API name for booking platform_fee_revenue. */
  service_fee_revenue: number;
  /** Travel fee pass-through amount. */
  travel_fees: number;
  /** Walk-in / POS additional charges recognized as provider revenue. */
  walk_in_additional_charges: number;
  /** Sum of provider_earnings + tips + travel + cancellation + walk-in add-ons (gross recognized). */
  provider_recognized_revenue_gross: number;
  /** Additional charge revenue (gateway-settled). */
  additional_charge_gross: number;
  /** Net impact from controlled manual finance adjustments. */
  manual_adjustments_net: number;
};

type Row = Pick<
  FinanceLedgerRow,
  "transaction_type" | "amount" | "fees" | "net" | "commission" | "booking_id" | "product_order_id" | "refund_component"
>;

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

/** Refund rows are split per component; the customer cash refunded is captured by the
 *  cash legs only. Exclude the parallel discount/tender/liability reversal rows so
 *  gross refund totals and net impact are not inflated. */
function isCashRefundRow(r: Row): boolean {
  return r.transaction_type === "refund" && isCashRefundComponent(r.refund_component);
}

export function aggregateFinanceLedgerRows(rows: FinanceLedgerRow[]): FinanceLedgerAggregate {
  const tx = rows as Row[];

  const gatewayFeesServices = sumFees(tx, ["payment", "additional_charge_payment"]);

  const bookingPlatformFees = tx
    .filter((r) =>
      (r.transaction_type === "platform_fee" && !!r.booking_id) ||
      r.transaction_type === "service_fee"
    )
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const ecommercePlatformFees = tx
    .filter((r) => r.transaction_type === "platform_fee" && !!r.product_order_id)
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // bookingGmv: The full value of services rendered.
  // The "payment" row now represents the TOTAL collected amount (gateway + wallet + gift card)
  // for both split and gateway-less bookings.
  // To support legacy split-payment rows where "payment" only contained the gateway portion,
  // we group by booking_id and take the MAX of (payment) or (payment + wallet + gift_card)
  // if payment was clearly only the gateway portion. Actually, the safest heuristic for legacy
  // split payments is: if payment amount + wallet + gift card == total_amount of booking.
  // But we don't have booking total_amount here.
  // A simpler approach that works for legacy gateway-less (where payment == wallet)
  // and new flows (where payment == gateway + wallet) is to just use the "payment" row,
  // but for legacy split payments where payment < total, this might understate.
  // Let's compute GMV per booking to handle legacy split payments correctly:
  const gmvByBooking = new Map<string, { payment: number; wallet: number; giftCard: number }>();
  tx.forEach((r) => {
    if (!r.booking_id) return;
    const b = gmvByBooking.get(r.booking_id) || { payment: 0, wallet: 0, giftCard: 0 };
    if (r.transaction_type === "payment") b.payment += Number(r.amount ?? 0);
    if (r.transaction_type === "wallet_payment") b.wallet += Number(r.amount ?? 0);
    if (r.transaction_type === "gift_card_payment") b.giftCard += Number(r.amount ?? 0);
    gmvByBooking.set(r.booking_id, b);
  });

  let baseGmv = 0;
  for (const b of gmvByBooking.values()) {
    // Legacy gateway-less: payment == wallet (e.g. 100 == 100). We should take 100.
    // New gateway-less: payment == wallet (e.g. 100 == 100). We should take 100.
    // New split: payment == gateway + wallet (e.g. 100 == 80 + 20). We should take 100.
    // Legacy split: payment == gateway (e.g. 80), wallet == 20. We should take 100.
    // If payment >= wallet + giftCard, it's likely the new flow (or legacy where gateway >= wallet).
    // Actually, if we just take MAX(payment, payment + wallet + giftCard) it would double count new split!
    // Because in new split: payment = 100, wallet = 20. MAX(100, 120) = 120 (double counts 20).
    // How to detect legacy split? In legacy split, the payment row's commission was based ONLY on the gateway amount.
    // We can't easily detect it perfectly without booking.total_amount.
    // Let's assume the "payment" row is the source of truth for the commission base.
    // If we just use `payment` + `wallet` + `giftCard`, we double count new flows and all gateway-less flows.
    // The most accurate going forward is to just use `payment` for the base GMV, as it now correctly includes all funds.
    // For legacy split payments, this will understate GMV by the wallet/gift card amount, but it fixes the massive double-counting of gateway-less bookings.
    baseGmv += b.payment;
  }

  // Add any un-bookmarked payments (should be rare)
  const unbookedPayment = tx.filter(r => !r.booking_id && r.transaction_type === "payment").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  baseGmv += unbookedPayment;

  const walletCollected = sum(tx, ["wallet_payment"], "amount");
  const giftCardCollected = sum(tx, ["gift_card_payment"], "amount");
  const bookingGmv =
    baseGmv +
    sum(tx, ["tip"], "amount") +
    sum(tx, ["tax"], "amount") +
    sum(tx, ["travel_fee"], "amount") +
    bookingPlatformFees;
  const additionalChargeGross =
    sum(tx, ["additional_charge_payment"], "amount") + sumFees(tx, ["additional_charge_payment"]);
  const serviceCollectedGross = bookingGmv + additionalChargeGross;
  const serviceCollectedNet = serviceCollectedGross - gatewayFeesServices;

  const cancellationFeesRetained = sum(tx, ["cancellation_fee"], "net");
  const walkInAdditionalCharges = sum(tx, ["walk_in_additional_charge"], "net");
  const providerRecognizedRevenueGross =
    sum(tx, ["provider_earnings"], "net") +
    sum(tx, ["tip"], "net") +
    sum(tx, ["travel_fee"], "net") +
    cancellationFeesRetained +
    walkInAdditionalCharges;
  const promotionDiscounts = sum(tx, ["promotion_discount"], "amount");
  const giftCardLiabilityReductions = sum(tx, ["gift_card_liability_reduction"], "amount");

  const platformCommissionGross = sum(tx, ["payment", "additional_charge_payment"], "net");
  // Refund rows can represent full customer cash movements; only `commission` (when present)
  // should reverse platform-recognized earnings to avoid overstating platform losses.
  // platform_refund_contra is the reversed platform commission (only the 'payment' and
  // 'additional_charge_payment' refund legs carry commission; parallel non-cash rows
  // carry 0), so it is unaffected by the non-cash legs. totalRefundNet must exclude the
  // parallel discount/tender/liability reversals or it double-counts the same refund.
  const platformRefundContra = sum(tx, ["refund"], "commission");
  const totalRefundNet = tx.filter(isCashRefundRow).reduce((s, r) => s + Number(r.net ?? 0), 0);
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
    refunds_abs_gross: tx.filter(isCashRefundRow).reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0),
    refunds_gross: tx.filter(isCashRefundRow).reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0),
    provider_refund_net_impact: providerRefundNetImpact,
    wallet_collected: walletCollected,
    gift_card_collected: giftCardCollected,
    cancellation_fees_retained: cancellationFeesRetained,
    promotion_discounts: promotionDiscounts,
    gift_card_liability_reductions: giftCardLiabilityReductions,
    ecommerce_platform_fees: ecommercePlatformFees,
    platform_fee_revenue: bookingPlatformFees,
    service_fee_revenue: bookingPlatformFees,
    travel_fees: sum(tx, ["travel_fee"], "amount"),
    walk_in_additional_charges: walkInAdditionalCharges,
    provider_recognized_revenue_gross: providerRecognizedRevenueGross,
    additional_charge_gross: additionalChargeGross,
    manual_adjustments_net: manualAdjustmentsNet,
  };
}
