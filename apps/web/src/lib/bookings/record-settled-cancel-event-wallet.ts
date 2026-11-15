import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The cancel event is written before settlement. Replace its wallet figure with
 * the amount that was actually credited (0 when the credit is still open).
 */
export async function recordSettledWalletOnCancelEvent(
  admin: SupabaseClient,
  bookingId: string,
  walletRefundAmount: number,
): Promise<void> {
  try {
    const { data: rows, error } = await admin
      .from("booking_events")
      .select("id, event_data")
      .eq("booking_id", bookingId)
      .eq("event_type", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      console.error("[cancel] could not read cancellation event:", error);
      return;
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return;
    const prior =
      row.event_data && typeof row.event_data === "object"
        ? (row.event_data as Record<string, unknown>)
        : {};
    const { error: updateError } = await admin
      .from("booking_events")
      .update({
        event_data: {
          ...prior,
          wallet_refund_amount: walletRefundAmount,
        },
      })
      .eq("id", row.id);
    if (updateError) {
      console.error("[cancel] could not store settled wallet amount:", updateError);
    }
  } catch (err) {
    console.error("[cancel] settled wallet event update failed:", err);
  }
}
