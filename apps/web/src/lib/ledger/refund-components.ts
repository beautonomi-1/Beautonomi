/**
 * Refund-component attribution for finance_transactions `refund` rows.
 *
 * The refund trigger (migrations 652 / 654) posts ONE finance_transactions row per
 * economic component of a completed refund. Every row has transaction_type='refund'
 * and is tagged with a `refund_component` (e.g. 'provider_earnings', 'platform_fee',
 * 'payment', 'promotion_discount', 'wallet_payment', ...). The component nets that
 * are cash-economic sum to -refund_amount; the remaining rows (discount/tender/
 * liability) are parallel representations.
 *
 * Consumers that attribute refunds to the PROVIDER — payout clawback, sales-history
 * provider_net, and "refunds affecting your earnings" displays — must count only the
 * components that were actually the provider's money. Platform fee/commission, tax,
 * the online add-on commission, discount contras, and wallet/gift tender legs are
 * NOT provider money and must be ignored, or the provider is over-clawed.
 *
 * Legacy / manual / single-row refunds carry refund_component '_legacy' or NULL and
 * are always counted as a full provider clawback (backward compatible).
 */

/**
 * refund_component values that are NOT the provider's money and therefore must be
 * excluded from any provider-facing refund deduction.
 */
export const NON_PROVIDER_REFUND_COMPONENTS = new Set<string>([
  "platform_fee",
  "service_fee",
  "tax",
  "payment", // carries reversed platform commission, not provider take
  "promotion_discount",
  "membership_discount",
  "loyalty_redemption",
  "loyalty_discount",
  "wallet_payment",
  "gift_card_payment",
  "gift_card_liability_reduction",
  "additional_charge_payment", // online add-on commission (platform's)
]);

/**
 * True when a `refund` row reduces the provider's recognised earnings / net
 * (sales history provider_net, dashboard + finance "refunds" deductions).
 * Includes walk_in_additional_charge because provider-collected add-ons ARE part of
 * provider_net. NULL/'_legacy'/unknown components count (legacy full clawback).
 */
export function isProviderEarningsRefundComponent(
  component: string | null | undefined,
): boolean {
  if (!component) return true;
  return !NON_PROVIDER_REFUND_COMPONENTS.has(component);
}

/**
 * True when a `refund` row claws back from the provider's payoutable balance.
 * Same as {@link isProviderEarningsRefundComponent} but ALSO excludes
 * walk_in_additional_charge: provider-collected in-person money is never held by the
 * platform, so neither its recognition nor its refund touches the payout balance.
 */
export function isPayoutRefundComponent(
  component: string | null | undefined,
): boolean {
  if (!component) return true;
  if (component === "walk_in_additional_charge") return false;
  return !NON_PROVIDER_REFUND_COMPONENTS.has(component);
}

/**
 * refund_component values that are PARALLEL (non-cash) reversals: discount contras,
 * tender legs and gift-card liability. The cash legs of a refund (provider_earnings,
 * platform_fee, payment, tip, travel, tax, cancellation_fee, walk_in_additional_charge,
 * additional_charge_payment) already penny-balance to the customer cash refunded, so
 * these parallel rows must NOT be added to a "total cash refunded" figure or a refund
 * count.
 */
export const NON_CASH_REFUND_COMPONENTS = new Set<string>([
  "promotion_discount",
  "membership_discount",
  "loyalty_redemption",
  "loyalty_discount",
  "wallet_payment",
  "gift_card_payment",
  "gift_card_liability_reduction",
]);

/**
 * True when a `refund` row is part of the customer cash refund (sums to the refunded
 * amount). Excludes the parallel discount/tender/liability reversals. NULL/'_legacy'
 * whole-refund rows count (they represent the cash refund directly).
 */
export function isCashRefundComponent(
  component: string | null | undefined,
): boolean {
  if (!component) return true;
  return !NON_CASH_REFUND_COMPONENTS.has(component);
}
