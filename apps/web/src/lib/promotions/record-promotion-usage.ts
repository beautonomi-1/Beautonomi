import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Record a promotion redemption exactly once for a (promotion, user, booking)
 * tuple and atomically bump `promotions.usage_count`.
 *
 * Safe to call from every payment path (Paystack webhook, wallet/gift no-gateway,
 * cash) and on retries:
 * - `promotion_usage` has UNIQUE(promotion_id, user_id, booking_id), so the insert
 *   is idempotent. We use ON CONFLICT DO NOTHING and only bump the counter when
 *   THIS call actually created the row (a duplicate returns no row).
 * - The counter bump is an atomic `usage_count = usage_count + 1` via RPC, so
 *   concurrent redemptions cannot lose increments.
 *
 * Failures are logged but never thrown — usage accounting must not break payment
 * settlement.
 */
export async function recordPromotionUsage(
  supabaseAdmin: SupabaseClient,
  params: { promotionId: string; userId: string; bookingId: string; discountAmount: number },
): Promise<void> {
  const { promotionId, userId, bookingId, discountAmount } = params;
  if (!promotionId || !userId || !bookingId || !(discountAmount > 0)) return;

  try {
    const { data: usageRow, error: usageError } = await (supabaseAdmin.from("promotion_usage") as any)
      .upsert(
        {
          promotion_id: promotionId,
          user_id: userId,
          booking_id: bookingId,
          discount_amount: discountAmount,
          used_at: new Date().toISOString(),
        },
        { onConflict: "promotion_id,user_id,booking_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (usageError) {
      console.error("[recordPromotionUsage] failed to record usage row:", usageError.message);
      return;
    }

    // Only increment when this call created the usage row (not a duplicate replay).
    if (usageRow?.id) {
      const { error: incError } = await (supabaseAdmin.rpc as any)("increment_promotion_usage", {
        p_promotion_id: promotionId,
      });
      if (incError) {
        console.error("[recordPromotionUsage] failed to increment usage_count:", incError.message);
      }
    }
  } catch (e) {
    console.error(
      "[recordPromotionUsage] unexpected error:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
