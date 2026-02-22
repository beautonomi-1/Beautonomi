import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createGroupBookingSchema = z.object({
  scheduled_date: z.string(),
  scheduled_time: z.string(),
  duration_minutes: z.number().int().min(15),
  team_member_id: z.string().uuid(),
  service_id: z.string().uuid(),
  total_price: z.number().min(0),
  notes: z.string().optional(),
  location_type: z.enum(["at_salon", "at_home"]).optional(),
  location_id: z.string().uuid().optional(),
  address_line1: z.string().optional(),
  address_city: z.string().optional(),
  address_postal_code: z.string().optional(),
  travel_fee: z.number().min(0).optional(),
  participants: z.array(z.object({
    client_name: z.string(),
    client_email: z.string().email().optional(),
    client_phone: z.string().optional(),
    service_id: z.string().uuid(),
    price: z.number().min(0),
  })).min(1),
});

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
        .select('*', { count: 'exact' })
        .eq('provider_id', providerId)
        .order('scheduled_date', { ascending: false });

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

      groupBookings = data || [];
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
 * Create a new group booking
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validationResult = createGroupBookingSchema.safeParse(body);
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

    // Check if group_bookings table exists
    try {
      // First check if table exists by attempting a count query
      const { error: tableCheckError } = await supabase
        .from('group_bookings')
        .select('id', { count: 'exact', head: true })
        .limit(0);

      if (tableCheckError) {
        if (tableCheckError.code === '42P01' || tableCheckError.message?.includes('does not exist')) {
          // Table doesn't exist yet, return error indicating feature not available
          return errorResponse(
            "Group bookings feature is not yet available. The database table needs to be created first.",
            "FEATURE_NOT_AVAILABLE",
            503
          );
        }
        throw tableCheckError;
      }

      // Generate reference number
      const refNumber = `GB-${Date.now().toString().slice(-6)}`;
      
      // Insert group booking
      const { data: newBooking, error: insertError } = await supabase
        .from('group_bookings')
        .insert({
          provider_id: providerId,
          ref_number: refNumber,
          scheduled_date: validationResult.data.scheduled_date,
          scheduled_time: validationResult.data.scheduled_time,
          duration_minutes: validationResult.data.duration_minutes,
          team_member_id: validationResult.data.team_member_id,
          service_id: validationResult.data.service_id,
          total_price: validationResult.data.total_price,
          notes: validationResult.data.notes || null,
          location_type: validationResult.data.location_type || 'at_salon',
          location_id: validationResult.data.location_id || null,
          address_line1: validationResult.data.address_line1 || null,
          address_city: validationResult.data.address_city || null,
          address_postal_code: validationResult.data.address_postal_code || null,
          travel_fee: validationResult.data.travel_fee || 0,
          status: 'booked',
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // Insert participants
      if (validationResult.data.participants && validationResult.data.participants.length > 0) {
        const participants = validationResult.data.participants.map((p: any) => ({
          group_booking_id: newBooking.id,
          client_name: p.client_name,
          client_email: p.client_email || null,
          client_phone: p.client_phone || null,
          service_id: p.service_id,
          price: p.price,
        }));

        const { error: participantsError } = await supabase
          .from('group_booking_participants')
          .insert(participants);

        if (participantsError) {
          // Rollback group booking if participants insert fails
          await supabase.from('group_bookings').delete().eq('id', newBooking.id);
          throw participantsError;
        }
      }

      return successResponse(newBooking);
    } catch (error: any) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return errorResponse(
          "Group bookings feature is not yet available. The database table needs to be created first.",
          "FEATURE_NOT_AVAILABLE",
          503
        );
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error, "Failed to create group booking");
  }
}
