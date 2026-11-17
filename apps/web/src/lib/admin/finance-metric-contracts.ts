export const FINANCE_METRIC_CONTRACT_VERSION = "2026.11.17.2";

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
      "platform_take_net + subscription_net + ads_net + marketing_credit_net + service_fee_revenue (platform fees net of platform_fee/service_fee refund nets) + gift_card_breakage",
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
  bookingCommission: {
    key: "bookingCommission",
    label: "Booking commission (net)",
    formula: "platform_commission_net — commission on payment and additional-charge legs, net of platform refund contra. Gateway fees are not included.",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  bookingTake: {
    key: "bookingTake",
    label: "Booking take (net)",
    formula: "booking_commission_net − booking gateway fees + manual_adjustments_net",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  gatewayFeesTotal: {
    key: "gatewayFeesTotal",
    label: "Gateway Fees (All platform-held gateways)",
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
    formula: "(platform_take_net + service_fee_revenue net of refunded platform fees) / service_collected_gross",
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
    formula: "platform recognized revenue net − non-booking gateway fees (booking fees already in platform_take_net)",
    source: ["finance_transactions", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "daily",
  },
  platformNetCash: {
    key: "platformNetCash",
    label: "Net platform cash (estimated)",
    formula:
      "collected inflows − wallet/gift tender − payouts − card/original refunds (refunds_platform_cash_out) − gateway fees",
    source: ["finance_transactions", "wallet_topups", "aggregateFinanceLedgerRows", "platform-cash-position"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
  refundsByTender: {
    key: "refundsByTender",
    label: "Customer refunds by tender",
    formula:
      "refunds_store_credit (wallet liability), refunds_platform_cash_out (card/original), refunds_in_person (cash); refunds_gross unchanged (all tenders)",
    source: ["finance_transactions.metadata.refund_tender", "aggregateFinanceLedgerRows"],
    timezone: "tenant",
    cadence: "near_realtime",
  },
};

export function getFinanceMetricContracts(keys: string[]) {
  return keys
    .map((key) => CONTRACTS[key])
    .filter((contract): contract is MetricContract => Boolean(contract));
}

