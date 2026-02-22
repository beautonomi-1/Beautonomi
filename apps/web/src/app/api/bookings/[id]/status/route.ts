import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse, getProviderIdForUser } from '@/lib/supabase/api-helpers';

/**
 * GET /api/bookings/[id]/status
 * 
 * Get booking status (customer, provider, or admin)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin']);
    const role = user.role;
    const { id: bookingId } = await params;
    const supabase = await getSupabaseServer();

    // Fetch booking status
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        customer_id,
        provider_id,
        confirmed_at,
        provider_en_route_at,
        provider_arrived_at,
        started_at,
        completed_at,
        cancelled_at,
        estimated_arrival,
        queue_position,
        estimated_wait_time,
        provider_location
      `)
      .eq('id', bookingId)
      .single();

    if (error || !booking) {
      return notFoundResponse('Booking not found');
    }

    // Verify user has access to this booking
    if (role !== 'superadmin') {
      if (role === 'provider_owner' || role === 'provider_staff') {
        const providerId = await getProviderIdForUser(user.id, supabase);
        if (booking.provider_id !== providerId) {
          return handleApiError(
            new Error('Forbidden'),
            'You do not have access to this booking',
            'FORBIDDEN',
            403
          );
        }
      } else {
        // Customer can only see their own bookings
        if (booking.customer_id !== user.id) {
          return handleApiError(
            new Error('Forbidden'),
            'You do not have access to this booking',
            'FORBIDDEN',
            403
          );
        }
      }
    }

    // Map booking status
    let mappedStatus: string = booking.status;
    if (booking.provider_en_route_at) {
      mappedStatus = 'provider_en_route';
    } else if (booking.provider_arrived_at) {
      mappedStatus = 'provider_arrived';
    } else if (booking.started_at) {
      mappedStatus = 'in_progress';
    } else if (booking.completed_at) {
      mappedStatus = 'completed';
    } else if (booking.cancelled_at) {
      mappedStatus = 'cancelled';
    } else if (booking.confirmed_at) {
      mappedStatus = 'confirmed';
    } else {
      mappedStatus = 'pending';
    }

    return successResponse({
      id: booking.id,
      status: mappedStatus,
      estimated_arrival: booking.estimated_arrival,
      provider_location: booking.provider_location,
      queue_position: booking.queue_position,
      estimated_wait_time: booking.estimated_wait_time,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch booking status');
  }
}
