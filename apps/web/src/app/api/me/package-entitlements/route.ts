import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireAuthInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/package-entitlements?provider_id=UUID&package_id=UUID (optional)
 *
 * Lists the signed-in customer's prepaid package entitlements for a provider (optional filter by package).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id")?.trim();
    const packageId = searchParams.get("package_id")?.trim();

    if (!providerId) {
      return handleApiError(new Error("provider_id required"), "provider_id is required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    if (!supabase) {
      return handleApiError(new Error("Database unavailable"), "Database unavailable", "DB_ERROR", 500);
    }

    let q = supabase
      .from("customer_package_entitlements")
      .select("id, package_id, sessions_remaining, valid_from, valid_until, metadata, created_at")
      .eq("customer_id", user.id)
      .eq("provider_id", providerId)
      .gt("sessions_remaining", 0);

    if (packageId) {
      q = q.eq("package_id", packageId);
    }

    const { data: rows, error } = await q.order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const list = (rows || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      package_id: r.package_id,
      sessions_remaining: r.sessions_remaining,
      valid_from: r.valid_from,
      valid_until: r.valid_until,
    }));

    return successResponse({ entitlements: list });
  } catch (e) {
    return handleApiError(e, "Failed to load entitlements");
  }
}
