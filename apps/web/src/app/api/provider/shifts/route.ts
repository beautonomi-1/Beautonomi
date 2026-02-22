import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createShiftSchema = z.object({
  staff_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
  is_recurring: z.boolean().optional(),
  recurring_pattern: z.any().optional(),
});

/**
 * GET /api/provider/shifts
 * 
 * Get provider's staff shifts
 * Query params: week_start (YYYY-MM-DD), staff_id (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const weekStart = searchParams.get('week_start');
    const staffId = searchParams.get('staff_id');

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    let query = supabase
      .from("staff_shifts")
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern,
        provider_staff:staff_id(id, name:users(full_name))
      `)
      .eq("provider_id", providerId)
      .order("date", { ascending: true });

    // Filter by date range (week)
    if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      query = query.gte("date", start.toISOString().split("T")[0])
                   .lte("date", end.toISOString().split("T")[0]);
    }

    // Filter by staff member
    if (staffId) {
      query = query.eq("staff_id", staffId);
    }

    const { data: shifts, error } = await query;

    if (error) {
      throw error;
    }

    // Transform response to match expected format
    const transformedShifts = (shifts || []).map((shift: any) => ({
      id: shift.id,
      team_member_id: shift.staff_id,
      team_member_name: shift.provider_staff?.name?.full_name || "Staff",
      date: shift.date,
      start_time: shift.start_time.substring(0, 5), // HH:MM format
      end_time: shift.end_time.substring(0, 5),
      notes: shift.notes,
      is_recurring: shift.is_recurring,
      recurring_pattern: shift.recurring_pattern,
    }));

    return successResponse(transformedShifts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch shifts");
  }
}

/**
 * POST /api/provider/shifts
 * 
 * Create a new shift
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createShiftSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { staff_id, date, start_time, end_time, notes, is_recurring, recurring_pattern } = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify staff belongs to provider
    const { data: staff } = await supabase
      .from("provider_staff")
      .select("id")
      .eq("id", staff_id)
      .eq("provider_id", providerId)
      .single();

    if (!staff) {
      return notFoundResponse("Staff member not found");
    }

    // Create shift
    const { data: newShift, error: insertError } = await (supabase
      .from("staff_shifts") as any)
      .insert({
        provider_id: providerId,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring: is_recurring || false,
        recurring_pattern,
      })
      .select(`
        id,
        staff_id,
        date,
        start_time,
        end_time,
        notes,
        is_recurring,
        recurring_pattern
      `)
      .single();

    if (insertError || !newShift) {
      throw insertError || new Error("Failed to create shift");
    }

    // Transform response
    const transformedShift = {
      id: newShift.id,
      team_member_id: newShift.staff_id,
      date: newShift.date,
      start_time: newShift.start_time.substring(0, 5),
      end_time: newShift.end_time.substring(0, 5),
      notes: newShift.notes,
      is_recurring: newShift.is_recurring,
      recurring_pattern: newShift.recurring_pattern,
    };

    return successResponse(transformedShift);
  } catch (error) {
    return handleApiError(error, "Failed to create shift");
  }
}
