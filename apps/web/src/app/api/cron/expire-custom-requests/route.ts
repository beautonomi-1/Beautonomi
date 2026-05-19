import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * GET /api/cron/expire-custom-requests
 *
 * Cleans up stale `custom_requests` and `custom_offers` once their `expires_at`
 * / `expiration_at` timestamp has passed. Mirrors `expire-on-demand-requests`.
 *
 * Without this, abandoned custom requests stay in `pending`/`offered` and the
 * customer-side inbox + provider-side "needs response" badge never settle.
 *
 * §custom-requests-lifecycle-2026-05
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error ?? "Unauthorized", { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();

    // 1. Expire stale custom_requests (pending or offered with no paid offer).
    //    A request flips to `expired` once expires_at passes — paid offers
    //    already mark the request `fulfilled` via finalizeCustomOfferPayment.
    const { data: staleRequests, error: requestError } = await admin
      .from("custom_requests")
      .update({ status: "expired", updated_at: now })
      .in("status", ["pending", "offered"])
      .lt("expires_at", now)
      .select("id");

    if (requestError) throw requestError;

    // 2. Expire any still-pending offers attached to expired requests.
    //    Offers also have their own expiration_at — handled below.
    const expiredRequestIds = (staleRequests ?? []).map((r: { id: string }) => r.id);
    if (expiredRequestIds.length > 0) {
      await admin
        .from("custom_offers")
        .update({ status: "expired", updated_at: now })
        .in("status", ["pending", "payment_pending"])
        .in("request_id", expiredRequestIds);
    }

    // 3. Expire pending offers whose own `expiration_at` lapsed.
    //    (The customer pay path lazily expires these too; this is just cleanup
    //    so the provider dashboard reflects the current state at a glance.)
    const { data: staleOffers, error: offerError } = await admin
      .from("custom_offers")
      .update({ status: "expired", updated_at: now })
      .eq("status", "pending")
      .lt("expiration_at", now)
      .select("id");

    if (offerError) throw offerError;

    return successResponse({
      message: "Expired custom requests and offers updated",
      expired_requests: staleRequests?.length ?? 0,
      expired_offers: staleOffers?.length ?? 0,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to expire custom requests");
  }
}
