import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

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
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Query booking by ID
    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        service_name,
        staff_id,
        scheduled_at,
        checked_in_time,
        status,
        notes,
        provider_staff:staff_id(
          id,
          name:users(full_name)
        )
      `)
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !booking) {
      return notFoundResponse("Waiting room entry not found");
    }

    // Transform booking to waiting room entry
    let wrStatus: "waiting" | "in_service" | "completed" | "left" = "waiting";
    if (booking.status === "started") {
      wrStatus = "in_service";
    } else if (booking.status === "completed") {
      wrStatus = "completed";
    } else if (booking.status === "cancelled" || booking.status === "no_show") {
      wrStatus = "left";
    }

    const staff = Array.isArray(booking.provider_staff) ? booking.provider_staff?.[0] : booking.provider_staff;
    const nameData = staff?.name;
    const staffName = Array.isArray(nameData) ? nameData?.[0]?.full_name : (nameData as { full_name?: string })?.full_name;
    const entry = {
      id: booking.id,
      appointment_id: booking.id,
      client_name: booking.customer_name || "Client",
      client_email: booking.customer_email,
      client_phone: booking.customer_phone,
      service_id: booking.service_id,
      service_name: booking.service_name || "Service",
      team_member_id: booking.staff_id,
      team_member_name: staffName || (staff as { full_name?: string })?.full_name || "Staff",
      checked_in_time: booking.checked_in_time || booking.scheduled_at,
      checked_in_method: "staff" as const,
      status: wrStatus,
      notes: booking.notes,
      position: undefined,
      estimated_wait_time: undefined,
    };

    return successResponse(entry);
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
    const supabase = await getSupabaseServer(request);
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
      bookingStatus = "started";
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
      .select(`
        id,
        booking_number,
        customer_id,
        customer_name,
        customer_email,
        customer_phone,
        service_id,
        service_name,
        staff_id,
        scheduled_at,
        checked_in_time,
        status,
        notes,
        provider_staff:staff_id(
          id,
          name:users(full_name)
        )
      `)
      .single();

    if (error) {
      throw error;
    }

    // Transform back to waiting room entry format
    let wrStatus: "waiting" | "in_service" | "completed" | "left" = "waiting";
    if (updatedBooking.status === "started") {
      wrStatus = "in_service";
    } else if (updatedBooking.status === "completed") {
      wrStatus = "completed";
    } else if (updatedBooking.status === "cancelled" || updatedBooking.status === "no_show") {
      wrStatus = "left";
    }

    const updStaff = Array.isArray(updatedBooking.provider_staff) ? updatedBooking.provider_staff?.[0] : updatedBooking.provider_staff;
    const updNameData = updStaff?.name;
    const updStaffName = Array.isArray(updNameData) ? updNameData?.[0]?.full_name : (updNameData as { full_name?: string })?.full_name;
    const entry = {
      id: updatedBooking.id,
      appointment_id: updatedBooking.id,
      client_name: updatedBooking.customer_name || "Client",
      client_email: updatedBooking.customer_email,
      client_phone: updatedBooking.customer_phone,
      service_id: updatedBooking.service_id,
      service_name: updatedBooking.service_name || "Service",
      team_member_id: updatedBooking.staff_id,
      team_member_name: updStaffName || (updStaff as { full_name?: string })?.full_name || "Staff",
      checked_in_time: updatedBooking.checked_in_time || updatedBooking.scheduled_at,
      checked_in_method: "staff" as const,
      status: wrStatus,
      notes: updatedBooking.notes,
      position: undefined,
      estimated_wait_time: undefined,
    };

    return successResponse(entry);
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
    const supabase = await getSupabaseServer(request);
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

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to remove from waiting room");
  }
}
