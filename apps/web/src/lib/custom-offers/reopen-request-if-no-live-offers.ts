import type { SupabaseClient } from "@supabase/supabase-js";

/** Offers that still own the request. A new quote must wait until these are gone. */
export const LIVE_CUSTOM_OFFER_STATUSES = [
  "pending",
  "changes_requested",
  "payment_pending",
  "accepted",
  "paid",
  "finalize_failed",
] as const;

/**
 * After the last live offer is declined, withdrawn, or expired, the parent
 * request goes back to `pending` so the provider can send another quote.
 * A fulfilled or cancelled request is left alone.
 */
export async function reopenCustomRequestIfNoLiveOffers(
  admin: SupabaseClient,
  requestId: string | null | undefined,
): Promise<void> {
  if (!requestId) return;
  const { data: liveOffers, error } = await admin
    .from("custom_offers")
    .select("id")
    .eq("request_id", requestId)
    .in("status", [...LIVE_CUSTOM_OFFER_STATUSES])
    .limit(1);
  if (error) {
    console.warn("[custom-offers] live-offer lookup failed:", requestId, error.message);
    return;
  }
  if (liveOffers && liveOffers.length > 0) return;
  const { error: reqErr } = await admin
    .from("custom_requests")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "offered");
  if (reqErr) {
    console.warn("[custom-offers] failed to reopen parent request:", requestId, reqErr.message);
  }
}
