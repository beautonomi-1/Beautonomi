import { NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { evaluateProviderSlotAgainstGrid } from "@/lib/provider-booking/compute-provider-slot-grid";
import { checkActiveHoldOverlap } from "@/lib/bookings/conflict-check";

/**
 * List/detail queries use the service-role client so provider_staff and
 * embedded `booking_participants` rows are visible consistently (RLS on
 * `group_bookings` is owner-centric; participant inserts often use admin).
 */

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

    const admin = getSupabaseAdmin();

    let groupBookings: any[] = [];
    let total = 0;
    
    try {
      let query = admin
        .from('group_bookings')
        .select('*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact, service_id, service_name, price, duration_minutes, addons, checked_in_at, checked_out_at)', { count: 'exact' })
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
      const serviceIds = [...new Set(raw.map((r: any) => r.service_id).filter(Boolean))];
      const staffIds = [...new Set(raw.map((r: any) => r.staff_id).filter(Boolean))];
      const [offeringsRes, staffRes] = await Promise.all([
        serviceIds.length > 0
          ? admin.from("offerings").select("id, title").in("id", serviceIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
        staffIds.length > 0
          ? admin.from("provider_staff").select("id, name").in("id", staffIds)
          : Promise.resolve({ data: [] as { id: string; name: string | null }[], error: null }),
      ]);
      const offeringTitle = new Map((offeringsRes.data || []).map((o: any) => [o.id, o.title]));
      const staffName = new Map((staffRes.data || []).map((s: any) => [s.id, s.name]));

      groupBookings = raw.map((row: any) => {
        const at = row.scheduled_at ? new Date(row.scheduled_at) : null;
        const participants = (row.booking_participants || []).map((p: any) => ({
          id: p.id,
          group_booking_id: row.id,
          client_name: p.participant_name || '—',
          client_email: p.participant_email,
          client_phone: p.participant_phone,
          service_id: p.service_id || '',
          service_name: p.service_name || '—',
          price: Number(p.price) || 0,
          duration_minutes: p.duration_minutes,
          addons: p.addons || [],
          checked_in: !!p.checked_in_at,
          checked_in_time: p.checked_in_at,
          checked_out: !!p.checked_out_at,
          checked_out_time: p.checked_out_at,
        }));
        const participantTotal = participants.reduce((sum: number, p: any) => sum + (Number(p.price) || 0), 0);
        const productTotal = Array.isArray(row.products)
          ? row.products.reduce((sum: number, p: any) => sum + (Number(p.total_price ?? p.totalPrice) || 0), 0)
          : 0;
        const totalPrice = row.total_price != null
          ? Number(row.total_price) || 0
          : participantTotal + productTotal + (Number(row.travel_fee) || 0);
        const sid = row.service_id as string | null | undefined;
        const tid = row.staff_id as string | null | undefined;
        return {
          ...row,
          service_name: row.service_name || (sid ? offeringTitle.get(sid) : null) || null,
          team_member_id: tid ?? null,
          team_member_name: tid ? staffName.get(tid) ?? null : null,
          current_participants: participants.length,
          total_price: totalPrice,
          scheduled_date: at ? at.toISOString().split('T')[0] : '',
          scheduled_time: at ? at.toTimeString().slice(0, 5) : '',
          participants,
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
      location_type,
      address_line1,
      address_city,
      address_state,
      address_country,
      address_postal_code,
      address_latitude,
      address_longitude,
      address_place_name,
      travel_fee,
      products,
      max_participants,
      duration_minutes,
      notes,
      participants,
      // §Provider-audit 2026-04 (packages round 2): persist the link to the
      // catalog service_package so reporting/discount math can be applied.
      package_id,
    } = body;

    if (!scheduled_at) {
      return errorResponse("scheduled_at is required", "VALIDATION_ERROR", 400);
    }

    // Commit-time availability check (same engine as single-booking create).
    // Only run when we have enough inputs to reason about; if staff/location
    // are missing we fall back to pending-creation (the provider can still
    // assign staff later and the calendar will show the row).
    const allowOverride = body?.allow_override === true;
    const effectiveDuration = Number.isFinite(Number(duration_minutes))
      ? Number(duration_minutes)
      : 60;
    const scheduledAtDate = new Date(scheduled_at);
    if (Number.isNaN(scheduledAtDate.getTime())) {
      return errorResponse("Invalid scheduled_at", "VALIDATION_ERROR", 400);
    }
    const normalizedProducts = Array.isArray(products) ? products : [];
    const normalizedParticipants = Array.isArray(participants) ? participants : [];
    const serverTravelFee = location_type === "at_home" ? Math.max(0, Number(travel_fee || 0)) : 0;
    const participantTotal = normalizedParticipants.reduce(
      (sum: number, p: any) => sum + Math.max(0, Number(p.price || 0)),
      0,
    );
    const productTotal = normalizedProducts.reduce(
      (sum: number, p: any) => sum + Math.max(0, Number(p.total_price ?? p.totalPrice ?? (Number(p.unit_price ?? p.unitPrice ?? 0) * Number(p.quantity ?? 1)))),
      0,
    );
    const serverTotalPrice = participantTotal + productTotal + serverTravelFee;

    if (!allowOverride) {
      const holdEnd = addMinutes(
        scheduledAtDate,
        effectiveDuration + (location_type === "at_home" ? 30 : 0),
      );
      const holdOverlap = await checkActiveHoldOverlap(admin, providerId, scheduledAtDate, holdEnd, {
        dbStaffId: staff_id ? String(staff_id) : null,
      });
      if (holdOverlap) {
        return errorResponse(
          "This time slot is no longer available. Please select another time.",
          "CONFLICT",
          409,
        );
      }

      const check = await evaluateProviderSlotAgainstGrid(admin, {
        providerId,
        scheduledAt: scheduledAtDate,
        durationMinutes: effectiveDuration,
        staffIdsCsv: staff_id ? String(staff_id) : null,
        locationId: location_type === "at_home" ? null : (location_id ? String(location_id) : null),
        excludeBookingId: undefined,
        mode: location_type === "at_home" ? "mobile" : "salon",
        travelBufferRaw: location_type === "at_home" ? "30" : null,
        minNoticeMinutes: 0,
        maxAdvanceDays: 365,
        resourceOfferingIds: service_id ? [String(service_id)] : [],
      });
      if (!check.ok) {
        return errorResponse(
          check.conflicts.join("; ") || "Slot is not available",
          "SLOT_NOT_AVAILABLE",
          409,
        );
      }
    }

    const { data: groupBooking, error: gbError } = await admin
      .from('group_bookings')
      .insert({
        provider_id: providerId,
        title: title || 'Group Session',
        scheduled_at,
        service_id: service_id || null,
        staff_id: staff_id || null,
        location_id: location_type === "at_home" ? null : (location_id || null),
        location_type: location_type === "at_home" ? "at_home" : "at_salon",
        address_line1: location_type === "at_home" ? (address_line1 || null) : null,
        address_city: location_type === "at_home" ? (address_city || null) : null,
        address_state: location_type === "at_home" ? (address_state || null) : null,
        address_country: location_type === "at_home" ? (address_country || null) : null,
        address_postal_code: location_type === "at_home" ? (address_postal_code || null) : null,
        address_latitude: location_type === "at_home" && address_latitude != null ? Number(address_latitude) : null,
        address_longitude: location_type === "at_home" && address_longitude != null ? Number(address_longitude) : null,
        address_place_name: location_type === "at_home" ? (address_place_name || null) : null,
        travel_fee: serverTravelFee,
        products: normalizedProducts,
        total_price: serverTotalPrice,
        max_participants: max_participants || 10,
        duration_minutes: duration_minutes || 60,
        notes: notes || null,
        status: 'confirmed',
        created_by: user.id,
        ...(package_id ? { package_id } : {}),
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

    // Add participants if provided (booking_id is nullable after migration 485)
    if (normalizedParticipants.length > 0) {
      const participantRows = normalizedParticipants.map((p: any, idx: number) => ({
        group_booking_id: groupBooking.id,
        booking_id: p.booking_id || null,
        participant_name: p.name || p.participant_name || p.client_name || '—',
        participant_email: p.email || p.participant_email || p.client_email || null,
        participant_phone: p.phone || p.participant_phone || p.client_phone || null,
        is_primary_contact: p.is_primary_contact ?? idx === 0,
        service_id: p.service_id || service_id || null,
        service_name: p.service_name || null,
        price: typeof p.price === 'number' ? p.price : 0,
        duration_minutes: typeof p.duration_minutes === 'number' ? p.duration_minutes : (duration_minutes || null),
        addons: Array.isArray(p.addons) ? p.addons : [],
      }));

      const { error: pError } = await admin
        .from('booking_participants')
        .insert(participantRows);

      if (pError) {
        console.warn("Failed to insert participants:", pError);
      }

      const linkedBookingIds = participantRows
        .map((p: any) => p.booking_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      if (linkedBookingIds.length > 0) {
        const { error: linkError } = await admin
          .from("bookings")
          .update({ group_booking_id: groupBooking.id, is_group_booking: true, updated_at: new Date().toISOString() })
          .eq("provider_id", providerId)
          .in("id", linkedBookingIds);
        if (linkError) {
          console.warn("Failed to link existing bookings to group:", linkError);
        }
      }
    }

    // Refetch with participants joined (include new service/pricing columns)
    const { data: fullBooking } = await admin
      .from('group_bookings')
      .select('*, booking_participants(id, participant_name, participant_email, participant_phone, is_primary_contact, service_id, service_name, price, duration_minutes, addons, checked_in_at, checked_out_at)')
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
        service_id: p.service_id || '',
        service_name: p.service_name || '—',
        price: p.price || 0,
        duration_minutes: p.duration_minutes,
        addons: p.addons || [],
        checked_in: !!p.checked_in_at,
        checked_in_time: p.checked_in_at,
        checked_out: !!p.checked_out_at,
        checked_out_time: p.checked_out_at,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to create group booking");
  }
}
