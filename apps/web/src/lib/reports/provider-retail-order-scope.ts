/** Payment methods where the provider collects funds (cash-register / POS semantics). */
export const PROVIDER_COLLECTED_RETAIL_PAYMENT_METHODS = [
  "cash",
  "card_on_delivery",
  "yoco",
] as const;

/**
 * Supabase `.or()` filter: walk-in POS plus online orders paid on collection
 * (not platform-held Paystack/wallet checkout).
 */
export function providerCollectedRetailOrdersOrFilter(): string {
  const methods = PROVIDER_COLLECTED_RETAIL_PAYMENT_METHODS.join(",");
  return `order_source.eq.walk_in,and(order_source.eq.online,payment_method.in.(${methods}))`;
}

export function isProviderCollectedRetailOrder(row: {
  order_source?: string | null;
  payment_method?: string | null;
}): boolean {
  if (String(row.order_source ?? "") === "walk_in") return true;
  if (String(row.order_source ?? "") !== "online") return false;
  const method = String(row.payment_method ?? "").toLowerCase();
  return (PROVIDER_COLLECTED_RETAIL_PAYMENT_METHODS as readonly string[]).includes(method);
}
