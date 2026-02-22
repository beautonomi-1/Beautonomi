/**
 * GET /api/public/booking-holds/[id]
 *
 * Fetch a booking hold for continuation (after auth).
 * Returns hold if active and not expired.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(
  request: NextRequest,
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

    const { data: hold, error } = await supabase
      .from("booking_holds")
      .select(
        "id, provider_id, staff_id, booking_services_snapshot, start_at, end_at, location_type, location_id, address_snapshot, hold_status, expires_at, created_by_user_id, guest_fingerprint_hash, metadata, created_at"
      )
      .eq("id", id)
      .single();

    if (error || !hold) {
      return handleApiError(
        new Error("Hold not found"),
        "Hold not found or expired",
        "NOT_FOUND",
        404
      );
    }

    if (hold.hold_status !== "active") {
      return handleApiError(
        new Error("Hold is no longer active"),
        hold.hold_status === "expired"
          ? "Your hold has expired. Please select a new time."
          : "This slot is no longer available.",
        "HOLD_INACTIVE",
        410
      );
    }

    const expiresAt = new Date(hold.expires_at);
    if (expiresAt < new Date()) {
      return handleApiError(
        new Error("Hold has expired"),
        "Your hold has expired. Please select a new time.",
        "HOLD_EXPIRED",
        410
      );
    }

    const metadata = (hold.metadata as Record<string, unknown>) || {};
    return successResponse({
      hold_id: hold.id,
      provider_id: hold.provider_id,
      staff_id: hold.staff_id,
      booking_services_snapshot: hold.booking_services_snapshot,
      start_at: hold.start_at,
      end_at: hold.end_at,
      location_type: hold.location_type,
      location_id: hold.location_id,
      address_snapshot: hold.address_snapshot,
      hold_status: hold.hold_status,
      expires_at: hold.expires_at,
      metadata: hold.metadata,
      travel_fee: metadata.travel_fee != null ? Number(metadata.travel_fee) : undefined,
      travel_distance_km: metadata.travel_distance_km != null ? Number(metadata.travel_distance_km) : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch booking hold");
  }
}
