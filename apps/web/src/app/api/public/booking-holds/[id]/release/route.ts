/**
 * POST /api/public/booking-holds/[id]/release
 *
 * Releases (cancels) a booking hold so it no longer blocks the slot.
 * Idempotent — calling on an already-released/expired/consumed hold is a no-op.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { withNoStore } from "@/lib/http/no-store";

/** Mutation on per-session state; responses are `Cache-Control: no-store` (never edge-cached). */
export const POST = withNoStore(handlePost);

async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return handleApiError(
        new Error("Hold ID is required"),
        "Hold ID is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const supabase = getSupabaseAdmin();

    await supabase
      .from("booking_holds")
      .update({ hold_status: "cancelled" })
      .eq("id", id)
      .eq("hold_status", "active");

    return successResponse({ released: true });
  } catch (error) {
    return handleApiError(error, "Failed to release hold");
  }
}
