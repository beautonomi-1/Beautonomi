/**
 * GET /api/cron/expire-booking-holds
 *
 * Expires active booking holds where expires_at < NOW().
 * Runs every 2 minutes (Vercel cron).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  try {
    // Verify cron request (secret + Vercel origin)
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: expired, error } = await supabase
      .from("booking_holds")
      .update({ hold_status: "expired" })
      .eq("hold_status", "active")
      .lt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Booking holds expired",
      expired_count: expired?.length ?? 0,
    });
  } catch (error) {
    return handleApiError(error, "Failed to expire booking holds");
  }
}
