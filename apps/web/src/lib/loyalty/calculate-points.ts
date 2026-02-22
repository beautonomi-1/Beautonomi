/**
 * Calculate loyalty points earned for a booking based on the active loyalty rule
 * 
 * @param bookingAmount - The total booking amount in the currency
 * @param supabase - Supabase client instance
 * @returns The number of points earned
 */
export async function calculateLoyaltyPoints(
  bookingAmount: number,
  supabase: any
): Promise<number> {
  try {
    // Get active loyalty rule
    const { data: activeRule, error } = await supabase
      .from("loyalty_rules")
      .select("points_per_currency_unit, currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !activeRule) {
      // Default: 1 point per 1 currency unit if no rule exists
      console.warn("No active loyalty rule found, using default: 1 point per 1 currency unit");
      return Math.floor(bookingAmount);
    }

    const pointsPerUnit = Number(activeRule.points_per_currency_unit) || 1;
    const points = Math.floor(bookingAmount * pointsPerUnit);

    return points;
  } catch (error) {
    console.error("Error calculating loyalty points:", error);
    // Fallback to default
    return Math.floor(bookingAmount);
  }
}
