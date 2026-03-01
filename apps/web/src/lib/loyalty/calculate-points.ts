/**
 * Calculate loyalty points earned for a booking based on the active loyalty rule.
 * Aligns with validate-booking (loyalty_rules.points_per_currency_unit).
 *
 * @param bookingAmount - The booking amount (e.g. subtotal or total) in the currency
 * @param supabase - Supabase client instance
 * @param currency - Optional; if provided, only uses a rule for this currency
 * @returns The number of points earned
 */
export async function calculateLoyaltyPoints(
  bookingAmount: number,
  supabase: any,
  currency?: string
): Promise<number> {
  try {
    let query = supabase
      .from("loyalty_rules")
      .select("points_per_currency_unit, currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1);
    if (currency) {
      query = query.eq("currency", currency);
    }
    const { data: activeRule, error } = await query.maybeSingle();

    if (error || !activeRule) {
      return Math.floor(bookingAmount);
    }

    const pointsPerUnit = Number(activeRule.points_per_currency_unit) || 1;
    return Math.floor(bookingAmount * pointsPerUnit);
  } catch (error) {
    console.error("Error calculating loyalty points:", error);
    return Math.floor(bookingAmount);
  }
}
