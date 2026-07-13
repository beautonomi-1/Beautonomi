import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/custom-requests
 * Provider inbox of custom requests
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return successResponse([]);

    const locationId = request.nextUrl.searchParams.get("location_id");
    const nowIso = new Date().toISOString();

    // Keep the inbox honest even if the scheduled cron has not run yet.
    // Providers should not see stale "pending" requests as actionable after
    // their customer-facing expiry time has passed.
    await supabase
      .from("custom_requests")
      .update({ status: "expired", updated_at: nowIso })
      .eq("provider_id", providerId)
      .in("status", ["pending", "offered"])
      .lt("expires_at", nowIso);

    const { data, error } = await supabase
      .from("custom_requests")
      .select(
        `
        *,
        customer:users(id, full_name, email, avatar_url),
        attachments:custom_request_attachments(id, url, created_at),
        offers:custom_offers(id, price, currency, duration_minutes, expiration_at, notes, status, payment_url, payment_reference, paid_at, created_at, staff_id, location_id, scheduled_at, change_request_note, changes_requested_at, staff:provider_staff(id, name), location:provider_locations(id, name))
      `
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    let result = data || [];
    // When location_id is set: show only requests with no offers (unclaimed) or with at least one offer at this location
    if (locationId) {
      result = result.filter((req: { offers?: { location_id: string | null }[] }) => {
        const offers = req.offers || [];
        if (offers.length === 0) return true;
        return offers.some((o: { location_id: string | null }) => o.location_id === locationId);
      });
    }

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to fetch custom requests");
  }
}

