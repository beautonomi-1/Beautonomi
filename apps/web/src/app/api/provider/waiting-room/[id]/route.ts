import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import {
  mapBookingEmbedToWaitingRoomEntry,
  WAITING_ROOM_BOOKING_SELECT,
  type WaitingRoomBookingEmbedRow,
} from "@/lib/provider-waiting-room/booking-to-waiting-room-entry";

const updateWaitingRoomEntrySchema = z.object({
  status: z.enum(["waiting", "in_service", "completed", "left"]).optional(),
  estimated_wait_time: z.number().optional(),
  position: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/provider/waiting-room/[id]
 * Get a specific waiting room entry (by appointment/booking ID)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(WAITING_ROOM_BOOKING_SELECT)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !booking) {
      return notFoundResponse("Waiting room entry not found");
    }

    const row = booking as unknown as WaitingRoomBookingEmbedRow;
    return successResponse(mapBookingEmbedToWaitingRoomEntry(row));
  } catch (error) {
    return handleApiError(error, "Failed to fetch waiting room entry");
  }
}

/**
 * PATCH /api/provider/waiting-room/[id]
 * Update waiting room entry status (updates the booking status)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateWaitingRoomEntrySchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify booking belongs to provider
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, checked_in_time")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Waiting room entry not found");
    }

    // Map waiting room status to booking status
    let bookingStatus = booking.status;
    if (validationResult.data.status === "in_service") {
      bookingStatus = "in_progress";
    } else if (validationResult.data.status === "completed") {
      bookingStatus = "completed";
    } else if (validationResult.data.status === "waiting") {
      bookingStatus = "waiting";
    }

    // Update booking
    const updateData: any = {
      status: bookingStatus,
    };

    // If marking as in service and not already checked in, set checked_in_time
    if (validationResult.data.status === "in_service" && !booking.checked_in_time) {
      updateData.checked_in_time = new Date().toISOString();
    }

    // If marking as completed, set completed_at
    if (validationResult.data.status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updatedBooking, error } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", id)
      .select(WAITING_ROOM_BOOKING_SELECT)
      .single();

    if (error) {
      throw error;
    }

    const updRow = updatedBooking as unknown as WaitingRoomBookingEmbedRow;
    return successResponse(mapBookingEmbedToWaitingRoomEntry(updRow));
  } catch (error) {
    return handleApiError(error, "Failed to update waiting room entry");
  }
}

/**
 * DELETE /api/provider/waiting-room/[id]
 * Remove entry from waiting room (marks appointment as left/cancelled)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("cancel_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify booking belongs to provider
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return notFoundResponse("Waiting room entry not found");
    }

    // Mark as cancelled/left (don't actually delete the booking)
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancellation_reason: "Client left waiting room",
      })
      .eq("id", id);

    if (error) {
      throw error;
    }

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(supabase, id);
    } catch (waitlistErr) {
      console.error("[waiting-room cancel] waitlist matching failed:", waitlistErr);
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove from waiting room");
  }
}
