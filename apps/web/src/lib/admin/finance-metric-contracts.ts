export const FINANCE_METRIC_CONTRACT_VERSION = "2026.07.05";

type MetricContract = {
  key: string;
  label: string;
  formula: string;
  source: string[];
  timezone: "UTC" | "tenant";
  cadence: "realtime" | "near_realtime" | "daily";
};

const CONTRACTS: Record<string, MetricContract> = {
  platformRecognizedRevenue: {
    key: "platformRecognizedRevenue",
    label: "Platform Recognized Revenue",
    formula:
      "platform_take_net + subscription_net + ads_net + service_fee_revenue + manual_adjustments_net",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  providerNetEarnings: {
    key: "providerNetEarnings",
    label: "Provider Net Earnings",
    formula:
      "provider_earnings + cancellation_fees + tips + travel_fees + walk_in_additional_charges - abs(provider_refund_net_impact)",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  taxesCollected: {
    key: "taxesCollected",
    label: "Taxes Collected (Pass-Through)",
    formula: "sum(finance_transactions where transaction_type='tax')",
    source: ["finance_transactions"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  liabilityWalletTopups: {
    key: "liabilityWalletTopups",
    label: "Wallet Topups Cash Collected",
    formula: "sum(wallet_topups.amount where status='paid')",
    source: ["wallet_topups"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  liabilityGiftCardOutstanding: {
    key: "liabilityGiftCardOutstanding",
    label: "Gift Card Outstanding Liability",
    formula: "sum(gift_cards.balance where is_active=true and balance>0)",
    source: ["gift_cards"],
    timezone: "tenant",
    cadence: "daily",
  },
  gatewayFeesServices: {
    key: "gatewayFeesServices",
    label: "Gateway Fees (Booking Services)",
    formula:
      "sum(finance_transactions.fees where transaction_type in payment, additional_charge_payment)",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  gatewayFeesTotal: {
    key: "gatewayFeesTotal",
    label: "Gateway Fees (All Paystack Flows)",
    formula:
      "gatewayFeesTotalFromAggregate — services + terminal + subscription + ads + marketing + gift/wallet + membership + payout transfers",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  bookingFrequency30d: {
    key: "bookingFrequency30d",
    label: "Booking frequency (30d)",
    formula: "completed bookings in 30d / customers with ≥1 completed in 30d",
    source: ["bookings"],
    timezone: "tenant",
    cadence: "daily",
  },
  repeatRate90d: {
    key: "repeatRate90d",
    label: "Repeat rate (90d)",
    formula: "customers with 2+ completed in 90d / customers with 1+ completed in 90d",
    source: ["bookings"],
    timezone: "tenant",
    cadence: "daily",
  },
  takeRate: {
    key: "takeRate",
    label: "Take rate",
    formula: "(platform_take_net + service_fee_revenue) / service_collected_gross",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "daily",
  },
  supplyLiquidity: {
    key: "supplyLiquidity",
    label: "Supply liquidity",
    formula: "transacting providers (30d) / status-active providers",
    source: ["bookings", "providers"],
    timezone: "tenant",
    cadence: "daily",
  },
  contributionMargin: {
    key: "contributionMargin",
    label: "Contribution margin",
    formula: "platform net − gateway fees − platform refund impact",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "daily",
  },
};

export function getFinanceMetricContracts(keys: string[]) {
  return keys
    .map((key) => CONTRACTS[key])
    .filter((contract): contract is MetricContract => Boolean(contract));
}

