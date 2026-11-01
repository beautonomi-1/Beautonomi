import type { SupabaseClient } from "@supabase/supabase-js";

export const ONCE_PER_CUSTOMER_MESSAGE =
  "You have already used this promo code";

/**
 * Returns true when this customer has any promotion_usage row for the promotion
 * (booking or product order). Errors are logged; returns false so checkout is not blocked.
 */
export async function customerHasPromotionUsage(
  supabase: SupabaseClient,
  promotionId: string,
  customerId: string,
): Promise<boolean> {
  if (!promotionId || !customerId) return false;
  try {
    const { count, error } = await supabase
      .from("promotion_usage")
      .select("id", { count: "exact", head: true })
      .eq("promotion_id", promotionId)
      .eq("user_id", customerId);
    if (error) {
      console.error("[customerHasPromotionUsage]", error.message);
      return false;
    }
    return Number(count ?? 0) > 0;
  } catch (e) {
    console.error(
      "[customerHasPromotionUsage] unexpected",
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
