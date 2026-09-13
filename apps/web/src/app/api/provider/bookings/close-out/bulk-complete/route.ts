import { NextRequest } from "next/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { isBulkCompleteEligibleStatus } from "@/lib/bookings/lifecycle-close-out";

/**
 * POST /api/provider/bookings/close-out/bulk-complete
 * Complete multiple in_progress / checked_in bookings in one request.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = (await request.json()) as { booking_ids?: string[] };
    const bookingIds = Array.isArray(body.booking_ids)
      ? body.booking_ids.filter((id) => typeof id === "string" && id.length > 0)
      : [];

    if (bookingIds.length === 0) {
      return errorResponse("booking_ids is required", "VALIDATION_ERROR", 400);
    }

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("provider_id", providerId)
      .in("id", bookingIds);

    if (error) throw error;

    const eligible = (bookings ?? []).filter((b) => isBulkCompleteEligibleStatus(String(b.status)));
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const booking of eligible) {
      const completeUrl = new URL(
        `/api/provider/bookings/${booking.id}/complete-service`,
        request.url,
      );
      const res = await fetch(completeUrl, {
        method: "POST",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
          authorization: request.headers.get("authorization") ?? "",
        },
      });
      results.push({
        id: booking.id as string,
        ok: res.ok,
        error: res.ok ? undefined : await res.text(),
      });
    }

    const rejected = (bookings ?? [])
      .filter((b) => !isBulkCompleteEligibleStatus(String(b.status)))
      .map((b) => ({
        id: b.id as string,
        ok: false,
        error: "status_not_eligible",
      }));

    const completed = results.filter((r) => r.ok).length;
    try {
      const { trackServer } = await import("@/lib/analytics/amplitude/server");
      const { EVENT_BOOKING_CLOSEOUT_BULK_COMPLETED } = await import(
        "@/lib/analytics/amplitude/types"
      );
      await trackServer(
        EVENT_BOOKING_CLOSEOUT_BULK_COMPLETED,
        { provider_id: providerId, completed, requested: bookingIds.length },
        user.id,
        { insertId: `booking_closeout_bulk_completed:${providerId}:${Date.now()}` },
      );
    } catch {
      // analytics is non-blocking
    }

    return successResponse({
      completed,
      results: [...results, ...rejected],
    });
  } catch (error) {
    return handleApiError(error, "Failed to bulk complete bookings");
  }
}
