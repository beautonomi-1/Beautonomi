import { NextRequest } from "next/server";
import {
  requireAuthInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * POST /api/me/age-signal
 * Records device-reported age range lower bound (when available).
 * Body: { lower_bound?: number, upper_bound?: number, source?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    await resolveTenantIdWithZaFallback(request);

    const body = await request.json().catch(() => ({}));
    const lowerBound =
      typeof body.lower_bound === "number" && Number.isFinite(body.lower_bound)
        ? Math.max(0, Math.floor(body.lower_bound))
        : null;
    const upperBound =
      typeof body.upper_bound === "number" && Number.isFinite(body.upper_bound)
        ? Math.max(0, Math.floor(body.upper_bound))
        : null;

    if (lowerBound == null && upperBound == null) {
      return errorResponse(
        "lower_bound or upper_bound is required",
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("users")
      .update({
        device_age_lower_bound: lowerBound,
        device_age_upper_bound: upperBound,
        device_age_signal_at: now,
        device_age_signal_source:
          typeof body.source === "string" ? body.source.trim().slice(0, 64) : "client",
      })
      .eq("id", user.id);

    if (error) return handleApiError(error, "Failed to record age signal");

    return successResponse({ recorded: true, device_age_signal_at: now });
  } catch (error) {
    return handleApiError(error, "Failed to record age signal");
  }
}
