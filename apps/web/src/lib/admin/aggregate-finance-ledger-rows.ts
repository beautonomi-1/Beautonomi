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
  refunds_gross: number;
};

type Row = Pick<FinanceLedgerRow, "transaction_type" | "amount" | "fees" | "net">;

function sum(tx: Row[], types: string[], field: "amount" | "fees" | "net"): number {
  return tx.filter((r) => types.includes(r.transaction_type ?? "")).reduce((s, r) => s + Number(r[field] ?? 0), 0);
}

function sumFees(tx: Row[], types: string[]): number {
  return tx.filter((r) => types.includes(r.transaction_type ?? "")).reduce((s, r) => s + Number(r.fees ?? 0), 0);
}

export function aggregateFinanceLedgerRows(rows: FinanceLedgerRow[]): FinanceLedgerAggregate {
  const tx = rows as Row[];

  const gatewayFeesServices = sumFees(tx, ["payment", "additional_charge_payment"]);

  const bookingGmv =
    sum(tx, ["payment"], "amount") +
    sum(tx, ["provider_earnings"], "amount") +
    sum(tx, ["tip"], "amount") +
    sum(tx, ["tax"], "amount") +
    sum(tx, ["travel_fee"], "amount") +
    sum(tx, ["service_fee"], "amount");
  const additionalChargeGross =
    sum(tx, ["additional_charge_payment"], "amount") + sumFees(tx, ["additional_charge_payment"]);
  const serviceCollectedGross = bookingGmv + additionalChargeGross;
  const serviceCollectedNet = serviceCollectedGross - gatewayFeesServices;

  const platformCommissionGross = sum(tx, ["payment", "additional_charge_payment"], "net");
  const platformRefundImpact = sum(tx, ["refund"], "net");
  const platformCommissionNet = platformCommissionGross + platformRefundImpact;

  const platformTakeNet = platformCommissionNet - gatewayFeesServices;

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
    platform_refund_impact: platformRefundImpact,
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
    refunds_gross: sum(tx, ["refund"], "amount"),
  };
}
