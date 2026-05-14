import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/me
 *
 * Lightweight "current provider" lookup used by portal dialogs (e.g.
 * `GroupBookingDialog`) that need the provider id without the full
 * `/api/provider/profile` payload. Returns `{ data: { id, business_name,
 * tenant_id, timezone } }` so callers can `provData.data?.id ?? provData.id`.
 *
 * §Group-booking-audit 2026-05: previously absent; provider portal logged a
 * noisy 404 on every group-booking dialog open. Adding this endpoint stops
 * the 404 chatter and gives a single canonical place to fetch the staff
 * member's active provider.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("id, business_name, slug, tenant_id, timezone, status")
      .eq("id", providerId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!provider) {
      return notFoundResponse("Provider not found");
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to load provider");
  }
}
