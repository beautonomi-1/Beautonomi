/**
 * POST /api/public/booking-holds/[id]/release
 *
 * Releases (cancels) a booking hold so it no longer blocks the slot.
 * Idempotent — calling on an already-released/expired/consumed hold is a no-op.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function POST(
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

    const { count } = await supabase
      .from("booking_holds")
      .update({ hold_status: "cancelled" })
      .eq("id", id)
      .eq("hold_status", "active");

    console.log("[booking-holds] released", { holdId: id, rowsUpdated: count ?? "unknown" });

    return successResponse({ released: true });
  } catch (error) {
    return handleApiError(error, "Failed to release hold");
  }
}
