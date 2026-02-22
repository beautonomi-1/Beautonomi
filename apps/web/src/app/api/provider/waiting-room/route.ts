import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";

const createWaitingRoomEntrySchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  appointment_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
  service_name: z.string().optional(),
  team_member_id: z.string().uuid().optional(),
  team_member_name: z.string().optional(),
  checked_in_method: z.enum(["self", "staff", "online"]).default("staff"),
  estimated_wait_time: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/provider/waiting-room
 * 
 * Get waiting room entries (appointments that are checked in and waiting)
 * The waiting room shows appointments with status "WAITING" (checked in but not started)
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Query bookings that are checked in (status = 'waiting' or 'checked_in')
    // These are appointments where the client has checked in but service hasn't started
    let query = supabase
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
      .eq("provider_id", providerId)
      .in("status", ["waiting", "checked_in", "confirmed"])
      .not("checked_in_time", "is", null)
      .order("checked_in_time", { ascending: true });

    // Filter by status if provided
    if (status && status !== 'all') {
      if (status === 'waiting') {
        query = query.in("status", ["waiting", "checked_in", "confirmed"]);
      } else if (status === 'in_service') {
        query = query.eq("status", "started");
      } else if (status === 'completed') {
        query = query.eq("status", "completed");
      }
    }

    const { data: bookings, error } = await query;

    if (error) {
      throw error;
    }

    // Transform bookings to waiting room entries
    const entries = (bookings || []).map((booking: any) => {
      // Determine waiting room status from booking status
      let wrStatus: "waiting" | "in_service" | "completed" | "left" = "waiting";
      if (booking.status === "started") {
        wrStatus = "in_service";
      } else if (booking.status === "completed") {
        wrStatus = "completed";
      } else if (booking.status === "cancelled" || booking.status === "no_show") {
        wrStatus = "left";
      }

      return {
        id: booking.id,
        appointment_id: booking.id,
        client_name: booking.customer_name || "Client",
        client_email: booking.customer_email,
        client_phone: booking.customer_phone,
        service_id: booking.service_id,
        service_name: booking.service_name || "Service",
        team_member_id: booking.staff_id,
        team_member_name: booking.provider_staff?.name || booking.provider_staff?.full_name || "Staff",
        checked_in_time: booking.checked_in_time || booking.scheduled_at,
        checked_in_method: "staff" as const, // Default to staff, could be enhanced
        status: wrStatus,
        notes: booking.notes,
        position: undefined, // Could calculate based on check-in time order
        estimated_wait_time: undefined,
      };
    });

    return successResponse(entries);
  } catch (error) {
    return handleApiError(error, "Failed to fetch waiting room entries");
  }
}

/**
 * POST /api/provider/waiting-room
 * 
 * Add entry to waiting room
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("create_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = createWaitingRoomEntrySchema.safeParse(body);
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

    const data = validationResult.data;
    const checkedInTime = new Date().toISOString();

    // If appointment_id is provided, update the existing booking
    if (data.appointment_id) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .update({
          checked_in_time: checkedInTime,
          status: "checked_in", // Set status to checked_in
        })
        .eq("id", data.appointment_id)
        .eq("provider_id", providerId)
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

      if (bookingError || !booking) {
        return handleApiError(
          bookingError || new Error("Booking not found"),
          "Failed to check in booking"
        );
      }

      // Transform to waiting room entry format
      const entry = {
        id: booking.id,
        appointment_id: booking.id,
        client_name: booking.customer_name || data.client_name || "Client",
        client_email: booking.customer_email || data.client_email,
        client_phone: booking.customer_phone || data.client_phone,
        service_id: booking.service_id || data.service_id,
        service_name: booking.service_name || data.service_name || "Service",
        team_member_id: booking.staff_id || data.team_member_id,
        team_member_name: (booking.provider_staff as any)?.name || data.team_member_name || "Staff",
        checked_in_time: booking.checked_in_time || checkedInTime,
        checked_in_method: data.checked_in_method || "staff",
        status: "waiting" as const,
        notes: booking.notes || data.notes,
        position: undefined,
        estimated_wait_time: data.estimated_wait_time,
      };

      return successResponse(entry);
    }

    // If no appointment_id, create a new booking for walk-in
    // This is for walk-in clients who don't have a pre-existing appointment
    const { data: newBooking, error: createError } = await supabase
      .from("bookings")
      .insert({
        provider_id: providerId,
        customer_id: null, // Walk-in, no customer account
        customer_name: data.client_name,
        customer_email: data.client_email,
        customer_phone: data.client_phone,
        scheduled_at: new Date().toISOString(), // Current time for walk-in
        location_type: 'at_salon',
        status: 'checked_in',
        checked_in_time: checkedInTime,
        staff_id: data.team_member_id || null,
        notes: data.notes || null,
      })
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

    if (createError || !newBooking) {
      return handleApiError(
        createError || new Error("Failed to create booking"),
        "Failed to add to waiting room"
      );
    }

    // If service_id is provided, create booking_service entry
    if (data.service_id) {
      // Get service details
      const { data: service } = await supabase
        .from("offerings")
        .select("id, duration_minutes, price, title")
        .eq("id", data.service_id)
        .single();

      if (service) {
        const serviceStart = new Date(checkedInTime);
        const serviceEnd = new Date(serviceStart.getTime() + (service.duration_minutes || 60) * 60000);

        await supabase
          .from("booking_services")
          .insert({
            booking_id: newBooking.id,
            offering_id: data.service_id,
            staff_id: data.team_member_id || null,
            scheduled_start_at: serviceStart.toISOString(),
            scheduled_end_at: serviceEnd.toISOString(),
            duration_minutes: service.duration_minutes || 60,
            price: service.price || 0,
            currency: 'ZAR',
          });

        // Update booking with service info
        await supabase
          .from("bookings")
          .update({
            service_id: data.service_id,
            service_name: service.title || data.service_name,
          })
          .eq("id", newBooking.id);
      }
    }

    // Transform to waiting room entry format
    const entry = {
      id: newBooking.id,
      appointment_id: newBooking.id,
      client_name: newBooking.customer_name || data.client_name,
      client_email: newBooking.customer_email || data.client_email,
      client_phone: newBooking.customer_phone || data.client_phone,
      service_id: newBooking.service_id || data.service_id,
      service_name: newBooking.service_name || data.service_name || "Service",
      team_member_id: newBooking.staff_id || data.team_member_id,
      team_member_name: (newBooking.provider_staff as any)?.name || data.team_member_name || "Staff",
      checked_in_time: newBooking.checked_in_time || checkedInTime,
      checked_in_method: data.checked_in_method || "staff",
      status: "waiting" as const,
      notes: newBooking.notes || data.notes,
      position: undefined,
      estimated_wait_time: data.estimated_wait_time,
    };

    return successResponse(entry);
  } catch (error) {
    return handleApiError(error, "Failed to add to waiting room");
  }
}
