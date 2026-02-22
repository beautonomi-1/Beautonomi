import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createTimeBlockSchema = z.object({
  staff_id: z.string().uuid().nullable().optional(),
  blocked_time_type_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_recurring: z.boolean().optional(),
  recurring_pattern: z.any().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().optional(),
});

/**
 * GET /api/provider/time-blocks
 * 
 * Get provider's time blocks
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const searchParams = request.nextUrl.searchParams;
    const staffId = searchParams.get('staff_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    let query = supabase
      .from("time_blocks")
      .select(`
        id,
        staff_id,
        blocked_time_type_id,
        name,
        date,
        start_time,
        end_time,
        is_recurring,
        recurring_pattern,
        is_active,
        notes,
        provider_staff:staff_id(id, name:users(full_name)),
        blocked_time_types:blocked_time_type_id(id, name, color)
      `)
      .eq("provider_id", providerId)
      .order("date", { ascending: true });

    if (staffId) {
      query = query.eq("staff_id", staffId);
    }

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data: timeBlocks, error } = await query;

    if (error) {
      throw error;
    }

    // Transform response
    const transformedBlocks = (timeBlocks || []).map((block: any) => ({
      id: block.id,
      team_member_id: block.staff_id,
      team_member_name: block.provider_staff?.name?.full_name || null,
      blocked_time_type_id: block.blocked_time_type_id,
      blocked_time_type_name: block.blocked_time_types?.name || null,
      blocked_time_type_color: block.blocked_time_types?.color || null,
      name: block.name,
      date: block.date,
      start_time: block.start_time.substring(0, 5),
      end_time: block.end_time.substring(0, 5),
      is_recurring: block.is_recurring,
      recurring_pattern: block.recurring_pattern,
      is_active: block.is_active,
      notes: block.notes,
    }));

    return successResponse(transformedBlocks);
  } catch (error) {
    return handleApiError(error, "Failed to fetch time blocks");
  }
}

/**
 * POST /api/provider/time-blocks
 * 
 * Create a new time block
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate input
    const validationResult = createTimeBlockSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const data = validationResult.data;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Create time block
    const { data: newBlock, error: insertError } = await (supabase
      .from("time_blocks") as any)
      .insert({
        provider_id: providerId,
        staff_id: data.staff_id || null,
        blocked_time_type_id: data.blocked_time_type_id || null,
        name: data.name,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        is_recurring: data.is_recurring || false,
        recurring_pattern: data.recurring_pattern,
        is_active: data.is_active ?? true,
        notes: data.notes,
      })
      .select(`
        id,
        staff_id,
        blocked_time_type_id,
        name,
        date,
        start_time,
        end_time,
        is_recurring,
        recurring_pattern,
        is_active,
        notes
      `)
      .single();

    if (insertError || !newBlock) {
      throw insertError || new Error("Failed to create time block");
    }

    const transformedBlock = {
      id: newBlock.id,
      team_member_id: newBlock.staff_id,
      blocked_time_type_id: newBlock.blocked_time_type_id,
      name: newBlock.name,
      date: newBlock.date,
      start_time: newBlock.start_time.substring(0, 5),
      end_time: newBlock.end_time.substring(0, 5),
      is_recurring: newBlock.is_recurring,
      recurring_pattern: newBlock.recurring_pattern,
      is_active: newBlock.is_active,
      notes: newBlock.notes,
    };

    return successResponse(transformedBlock);
  } catch (error) {
    return handleApiError(error, "Failed to create time block");
  }
}
