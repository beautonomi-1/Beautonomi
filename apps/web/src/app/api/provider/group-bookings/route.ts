import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/group-bookings
 * 
 * Get provider's group bookings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check if group_bookings table exists by attempting a query
    // If table doesn't exist, return empty array gracefully
    let groupBookings: any[] = [];
    let total = 0;
    
    try {
      const query = supabase
        .from('group_bookings')
        .select('*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact)', { count: 'exact' })
        .eq('provider_id', providerId)
        .order('scheduled_at', { ascending: false });

      // Apply status filter if provided
      if (status) {
        query.eq('status', status);
      }

      // Apply pagination
      query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        // If table doesn't exist, error code will be 42P01 (undefined_table)
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          // Table doesn't exist yet, return empty array
          return successResponse({
            data: [],
            total: 0,
            page,
            limit,
            total_pages: 0,
          });
        }
        throw error;
      }

      // Normalize for UI: derive scheduled_date/scheduled_time from scheduled_at; map booking_participants to participants
      const raw = data || [];
      groupBookings = raw.map((row: any) => {
        const at = row.scheduled_at ? new Date(row.scheduled_at) : null;
        return {
          ...row,
          scheduled_date: at ? at.toISOString().split('T')[0] : '',
          scheduled_time: at ? at.toTimeString().slice(0, 5) : '',
          participants: (row.booking_participants || []).map((p: any) => ({
            id: p.id,
            group_booking_id: row.id,
            client_name: p.participant_name || '—',
            client_email: p.participant_email,
            client_phone: p.participant_phone,
            service_name: '—',
            price: 0,
            checked_in: false,
            checked_out: false,
          })),
        };
      });
      total = count || 0;
    } catch (error: any) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return successResponse({
          data: [],
          total: 0,
          page,
          limit,
          total_pages: 0,
        });
      }
      throw error;
    }

    return successResponse({
      data: groupBookings,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch group bookings");
  }
}

/**
 * POST /api/provider/group-bookings
 *
 * Provider-created group bookings use a different schema (scheduled_date, group_booking_participants)
 * than the customer-initiated flow (scheduled_at, booking_participants). Until that schema is added,
 * we return 503 so the UI can show a clear message instead of a generic insert error.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    return errorResponse(
      "Group bookings are created when customers book with multiple participants. Creating group bookings from the provider portal is not yet supported.",
      "FEATURE_NOT_AVAILABLE",
      503
    );
  } catch (error) {
    return handleApiError(error, "Failed to create group booking");
  }
}
