import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/group-bookings
 * 
 * Get provider's group bookings with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const search = searchParams.get('search')?.trim();
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    let groupBookings: any[] = [];
    let total = 0;
    
    try {
      let query = supabase
        .from('group_bookings')
        .select('*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact)', { count: 'exact' })
        .eq('provider_id', providerId)
        .order('scheduled_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      if (dateFrom) {
        query = query.gte('scheduled_at', `${dateFrom}T00:00:00`);
      }
      if (dateTo) {
        query = query.lte('scheduled_at', `${dateTo}T23:59:59`);
      }

      if (search) {
        query = query.or(`ref_number.ilike.%${search}%`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        if (error.code === '42P01' || error.code === '42703' || error.message?.includes('does not exist')) {
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
      if (error.code === '42P01' || error.code === '42703' || error.message?.includes('does not exist')) {
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
 * Create a group booking from the provider portal.
 * Accepts: title, scheduled_at, service_id, staff_id, location_id,
 *          max_participants, duration_minutes, notes, participants[]
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const {
      title,
      scheduled_at,
      service_id,
      staff_id,
      location_id,
      max_participants,
      duration_minutes,
      notes,
      participants,
    } = body;

    if (!scheduled_at) {
      return errorResponse("scheduled_at is required", "VALIDATION_ERROR", 400);
    }

    // Create the group booking row
    const { data: groupBooking, error: gbError } = await admin
      .from('group_bookings')
      .insert({
        provider_id: providerId,
        title: title || 'Group Session',
        scheduled_at,
        service_id: service_id || null,
        staff_id: staff_id || null,
        location_id: location_id || null,
        max_participants: max_participants || 10,
        duration_minutes: duration_minutes || 60,
        notes: notes || null,
        status: 'confirmed',
        created_by: user.id,
      })
      .select()
      .single();

    if (gbError) {
      if (gbError.code === '42P01' || gbError.message?.includes('does not exist')) {
        return errorResponse(
          "Group bookings table is not yet set up. Please run the database migrations.",
          "TABLE_NOT_FOUND",
          503
        );
      }
      throw gbError;
    }

    // Add participants if provided
    if (Array.isArray(participants) && participants.length > 0) {
      const participantRows = participants.map((p: any, idx: number) => ({
        group_booking_id: groupBooking.id,
        participant_name: p.name || p.participant_name || '—',
        participant_email: p.email || p.participant_email || null,
        participant_phone: p.phone || p.participant_phone || null,
        is_primary_contact: idx === 0,
      }));

      const { error: pError } = await admin
        .from('booking_participants')
        .insert(participantRows);

      if (pError) {
        console.warn("Failed to insert participants:", pError);
      }
    }

    // Refetch with participants joined
    const { data: fullBooking } = await admin
      .from('group_bookings')
      .select('*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact)')
      .eq('id', groupBooking.id)
      .single();

    const result = fullBooking || groupBooking;
    const at = result.scheduled_at ? new Date(result.scheduled_at) : null;

    return successResponse({
      ...result,
      scheduled_date: at ? at.toISOString().split('T')[0] : '',
      scheduled_time: at ? at.toTimeString().slice(0, 5) : '',
      participants: (result.booking_participants || []).map((p: any) => ({
        id: p.id,
        group_booking_id: result.id,
        client_name: p.participant_name || '—',
        client_email: p.participant_email,
        client_phone: p.participant_phone,
        service_name: '—',
        price: 0,
        checked_in: false,
        checked_out: false,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to create group booking");
  }
}
