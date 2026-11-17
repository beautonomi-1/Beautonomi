import { subtractMoney, addMoney } from "@beautonomi/utils";
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
    | "refunds_store_credit"
    | "refunds_in_person"
    | "refunds_platform_cash_out"
    | "wallet_collected"
    | "gift_card_collected"
    | "payout_transfer_fees"
  >;
  walletTopupCashCollected: number;
  gatewayFeesTotal?: number;
};

export function computePlatformCashCollected(params: PlatformCashPositionParams): number {
  const { agg, walletTopupCashCollected } = params;
  const grossInflows = addMoney(
    addMoney(
      addMoney(
        addMoney(
          addMoney(agg.service_collected_gross, walletTopupCashCollected),
          agg.gift_card_sales,
        ),
        agg.subscription_gross,
      ),
      agg.ads_gross,
    ),
    agg.marketing_credit_gross,
  );
  // Booking `payment` amounts already include wallet/gift tender; those tenders were
  // custodial inflows at top-up / gift sale, so subtract parallel legs from cash held.
  return subtractMoney(
    grossInflows,
    addMoney(agg.wallet_collected, agg.gift_card_collected),
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
  const cardRefundsOut = agg.refunds_platform_cash_out ?? agg.refunds_abs_gross;
  return subtractMoney(
    subtractMoney(subtractMoney(collected, agg.payouts_paid_total), cardRefundsOut),
    gatewayFees,
  );
}

export function buildPlatformCashPosition(params: PlatformCashPositionParams) {
  const collected = computePlatformCashCollected(params);
  const gatewayFees =
    params.gatewayFeesTotal ?? gatewayFeesTotalFromAggregate(params.agg as FinanceLedgerAggregate);
  const { agg } = params;
  const cardRefundsOut = agg.refunds_platform_cash_out ?? agg.refunds_abs_gross;
  return {
    collected,
    provider_payouts: agg.payouts_paid_total,
    refunds_gross: agg.refunds_abs_gross,
    refunds_store_credit: agg.refunds_store_credit ?? 0,
    refunds_in_person: agg.refunds_in_person ?? 0,
    refunds_platform_cash_out: cardRefundsOut,
    gateway_fees: gatewayFees,
    payout_transfer_fees: agg.payout_transfer_fees,
    net_platform_cash: subtractMoney(
      subtractMoney(subtractMoney(collected, agg.payouts_paid_total), cardRefundsOut),
      gatewayFees,
    ),
  };
}
