import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/staff/available
 * 
 * Get available staff for a specific date/time and service
 * 
 * Query params:
 * - date: YYYY-MM-DD
 * - startTime: HH:mm
 * - endTime: HH:mm
 * - serviceId: UUID (optional - filter by who offers this service)
 * - locationId: UUID (optional - filter by location)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    
    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse({ data: [] });
    }

    // Get query params
    const date = searchParams.get('date');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const serviceId = searchParams.get('serviceId');
    const locationId = searchParams.get('locationId');

    // Base query: get all active staff
    let query = supabase
      .from("provider_staff")
      .select(`
        *,
        staff_services!left(service_id, offering_id),
        staff_schedules!left(day_of_week, start_time, end_time, is_working),
        staff_time_off!left(start_date, end_date, reason),
        provider_staff_locations!left(location_id)
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true);

    // Filter by location if provided (using junction table)
    if (locationId) {
      query = query.eq("provider_staff_locations.location_id", locationId);
    }

    const { data: staff, error } = await query;

    if (error) {
      throw error;
    }

    if (!staff) {
      return successResponse({ data: [] });
    }

    // Pre-fetch all bookings for this provider on this date
    const existingBookingsMap: Record<string, any[]> = {};
    if (date && startTime && endTime) {
      const { data: dayBookings } = await supabase
        .from("booking_services")
        .select("staff_id, start_time, end_time, booking:bookings!inner(status, scheduled_at)")
        .eq("booking.provider_id", providerId)
        .in("booking.status", ["confirmed", "checked_in", "in_progress"]);

      // Group by staff_id
      for (const bs of dayBookings || []) {
        if (!existingBookingsMap[bs.staff_id]) existingBookingsMap[bs.staff_id] = [];
        existingBookingsMap[bs.staff_id].push(bs);
      }
    }

    // Filter staff based on availability
    const availableStaff = staff.filter(member => {
      // 1. Check if staff offers the service (if serviceId provided)
      if (serviceId) {
        const offersService = (member as any).staff_services?.some(
          (ss: any) => ss.service_id === serviceId || ss.offering_id === serviceId
        );
        if (!offersService) return false;
      }

      // 2. Check if working on this day/time (if date/time provided)
      if (date && startTime && endTime) {
        const dayOfWeek = new Date(date).getDay(); // 0 = Sunday, 6 = Saturday
        const schedule = (member as any).staff_schedules?.find(
          (s: any) => s.day_of_week === dayOfWeek
        );
        
        // Not working this day
        if (!schedule || !schedule.is_working) return false;
        
        // Check if time slot is within working hours
        if (schedule.start_time && schedule.end_time) {
          if (startTime < schedule.start_time || endTime > schedule.end_time) {
            return false;
          }
        }
      }

      // 3. Check if on time off (if date provided)
      if (date) {
        const isOnTimeOff = (member as any).staff_time_off?.some((timeOff: any) => {
          return date >= timeOff.start_date && date <= timeOff.end_date;
        });
        if (isOnTimeOff) return false;
      }

      // 4. Check if already booked at this time (if date/time provided)
      if (date && startTime && endTime) {
        const staffBookings = existingBookingsMap[member.id] || [];
        const hasConflict = staffBookings.some((b: any) => {
          const bDate = (b.booking as any)?.scheduled_at?.split('T')[0];
          return bDate === date; // Staff is busy on this date at this time
        });
        if (hasConflict) return false;
      }

      return true;
    });

    // Clean up response (remove joined tables)
    const cleanedStaff = availableStaff.map(member => {
      const { staff_services: _staff_services, staff_schedules: _staff_schedules, staff_time_off: _staff_time_off, provider_staff_locations: _provider_staff_locations, ...rest } = member as any;
      return rest;
    });

    return successResponse({ data: cleanedStaff });
  } catch (error) {
    return handleApiError(error, "Failed to fetch available staff");
  }
}
