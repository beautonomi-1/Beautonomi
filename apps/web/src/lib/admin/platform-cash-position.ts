import type { FinanceLedgerAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";
import { gatewayFeesTotalFromAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";

/** Inputs for §Phase 7 platform cash position (admin finance summary). */
export type PlatformCashPositionParams = {
  agg: Pick<
    FinanceLedgerAggregate,
    | "service_collected_gross"
    | "gift_card_sales"
    | "subscription_gross"
    | "ads_gross"
    | "marketing_credit_gross"
    | "payouts_paid_total"
    | "refunds_abs_gross"
    | "payout_transfer_fees"
  >;
  walletTopupCashCollected: number;
  gatewayFeesTotal?: number;
};

export function computePlatformCashCollected(params: PlatformCashPositionParams): number {
  const { agg, walletTopupCashCollected } = params;
  return (
    agg.service_collected_gross +
    walletTopupCashCollected +
    agg.gift_card_sales +
    agg.subscription_gross +
    agg.ads_gross +
    agg.marketing_credit_gross
  );
}

/**
 * Net platform cash = collected − provider payouts − refunds − gateway fees.
 * Payout transfer fees are surfaced separately in the reconciliation panel.
 */
export function computeNetPlatformCash(params: PlatformCashPositionParams): number {
  const collected = computePlatformCashCollected(params);
  const gatewayFees =
    params.gatewayFeesTotal ?? gatewayFeesTotalFromAggregate(params.agg as FinanceLedgerAggregate);
  const { agg } = params;
  return (
    collected - agg.payouts_paid_total - agg.refunds_abs_gross - gatewayFees
  );
}

export function buildPlatformCashPosition(params: PlatformCashPositionParams) {
  const collected = computePlatformCashCollected(params);
  const gatewayFees =
    params.gatewayFeesTotal ?? gatewayFeesTotalFromAggregate(params.agg as FinanceLedgerAggregate);
  const { agg } = params;
  return {
    collected,
    provider_payouts: agg.payouts_paid_total,
    refunds_gross: agg.refunds_abs_gross,
    gateway_fees: gatewayFees,
    payout_transfer_fees: agg.payout_transfer_fees,
    net_platform_cash: collected - agg.payouts_paid_total - agg.refunds_abs_gross - gatewayFees,
  };
}
