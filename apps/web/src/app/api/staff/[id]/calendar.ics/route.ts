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

    // Transform to calendar events format
    const calendarAppointments = (appointments || []).map((apt: any) => {
      const booking = apt.bookings;
      const customer = booking?.customers;
      const provider = booking?.providers;
      const location = booking?.locations;

      return {
        id: apt.id,
        booking_number: booking?.booking_number || '',
        scheduled_at: apt.scheduled_start_at,
        duration_minutes: apt.duration_minutes,
        customer_name: booking?.guest_name || customer?.name,
        customer_email: customer?.email,
        service_title: apt.offerings?.title,
        location_name: location?.name,
        location_address: location?.address,
        provider_name: provider?.name,
        status: booking?.status || 'confirmed',
      };
    });

    // Generate iCal content
    const staffEmail = (staff.users as any)?.email || staff.email || 'staff@beautonomi.com';
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
