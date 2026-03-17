import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { generateStaffCalendar } from "@/lib/ical/generator";

/**
 * GET /api/staff/[id]/calendar.ics
 * 
 * Generate iCal file for staff member's appointments
 * Public endpoint (no auth required) - uses staff ID as access token
 * Only includes appointments, not time blocks (per Mangomint requirements)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: staffId } = await params;
    const supabase = await getSupabaseServer();

    // Load staff member details
    const { data: staff, error: staffError } = await supabase
      .from('provider_staff')
      .select(`
        id,
        name,
        email,
        users!inner (
          email
        )
      `)
      .eq('id', staffId)
      .single();

    if (staffError || !staff) {
      return new Response('Staff member not found', { status: 404 });
    }

    // Load appointments for this staff member
    // Only include confirmed/upcoming appointments (not cancelled)
    const { data: appointments, error: appointmentsError } = await supabase
      .from('booking_services')
      .select(`
        id,
        scheduled_start_at,
        scheduled_end_at,
        duration_minutes,
        bookings!inner (
          id,
          booking_number,
          scheduled_at,
          status,
          guest_name,
          location_type,
          location_id,
          customers (
            name,
            email
          ),
          providers (
            name
          ),
          locations (
            name,
            address
          )
        ),
        offerings (
          title
        )
      `)
      .eq('staff_id', staffId)
      .gte('scheduled_start_at', new Date().toISOString()) // Only future appointments
      .neq('bookings.status', 'cancelled')
      .order('scheduled_start_at', { ascending: true });

    if (appointmentsError) {
      console.error('Error loading appointments:', appointmentsError);
      return new Response('Error loading appointments', { status: 500 });
    }

    type AptBooking = {
      booking_number?: string;
      guest_name?: string;
      status?: string;
      customers?: { name?: string; email?: string } | Array<{ name?: string; email?: string }>;
      providers?: { name?: string } | Array<{ name?: string }>;
      locations?: { name?: string; address?: string } | Array<{ name?: string; address?: string }>;
    };
    type AptRow = {
      id: string;
      scheduled_start_at?: string;
      duration_minutes?: number;
      offerings?: { title?: string } | Array<{ title?: string }>;
      bookings?: AptBooking | Array<AptBooking>;
    };
    const calendarAppointments = (appointments ?? []).map((apt: AptRow) => {
      const booking = apt.bookings != null ? (Array.isArray(apt.bookings) ? apt.bookings[0] : apt.bookings) : undefined;
      const customer = booking?.customers != null ? (Array.isArray(booking.customers) ? booking.customers[0] : booking.customers) : undefined;
      const provider = booking?.providers != null ? (Array.isArray(booking.providers) ? booking.providers[0] : booking.providers) : undefined;
      const location = booking?.locations != null ? (Array.isArray(booking.locations) ? booking.locations[0] : booking.locations) : undefined;
      const offering = apt.offerings != null ? (Array.isArray(apt.offerings) ? apt.offerings[0] : apt.offerings) : undefined;

      return {
        id: apt.id,
        booking_number: booking?.booking_number ?? "",
        scheduled_at: apt.scheduled_start_at,
        duration_minutes: apt.duration_minutes,
        customer_name: booking?.guest_name ?? customer?.name,
        customer_email: customer?.email,
        service_title: offering?.title,
        location_name: location?.name,
        location_address: location?.address,
        provider_name: provider?.name,
        status: booking?.status ?? "confirmed",
      };
    });

    const staffEmail = (staff.users as { email?: string } | null)?.email ?? staff.email ?? "staff@beautonomi.com";
    const staffName = staff.name || 'Staff Member';
    const icalContent = generateStaffCalendar(calendarAppointments, staffName, staffEmail);

    // Return as iCal file
    return new Response(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="beautonomi-calendar-${staffId}.ics"`,
      },
    });
  } catch (error) {
    console.error('Error generating iCal:', error);
    return new Response('Error generating calendar', { status: 500 });
  }
}
