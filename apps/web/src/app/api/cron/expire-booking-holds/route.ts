/**
 * GET /api/cron/expire-booking-holds
 *
 * Expires booking holds where expires_at < NOW() AND reclaims any `consuming`
 * leases whose workers died before completing (B4 backstop).
 * Runs every 2 minutes (Vercel cron).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "expire-booking-holds";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error || "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request), { staleAfterMinutes: 5 });
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Use the RPC added in migration 502 which (a) expires rows past
    // expires_at regardless of state, and (b) reclaims `consuming` rows
    // whose lease is older than 5 minutes back to `active`.
    const { data, error } = await (supabase.rpc as any)(
      "expire_stale_booking_holds",
      { p_consuming_grace_seconds: 300 },
    );

    if (error) {
      // Fallback for environments where migration 502 hasn't landed yet.
      const { data: expired, error: legacyError } = await supabase
        .from("booking_holds")
        .update({ hold_status: "expired" })
        .eq("hold_status", "active")
        .lt("expires_at", new Date().toISOString())
        .select("id");

      if (legacyError) {
        throw legacyError;
      }

      return successResponse({
        message: "Booking holds expired (legacy path)",
        expired_count: expired?.length ?? 0,
        reclaimed_count: 0,
        fallback: true,
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return successResponse({
      message: "Booking holds expired + stale consuming leases reclaimed",
      expired_count: Number(row?.expired_count ?? 0),
      reclaimed_count: Number(row?.reclaimed_count ?? 0),
    });
  } catch (error) {
    return handleApiError(error, "Failed to expire booking holds");
  }
}
