import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
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
  notes: z.string().nullable().optional(),
});

/**
 * Normalize recurring_pattern to the format the availability engine expects:
 *   { frequency: "weekly"|"daily"|"monthly", days?: number[], end_date?: string }
 *
 * The web UI historically stored { pattern, interval, end_date, occurrences }
 * while the mobile UI sends { frequency, days }. This normalizer accepts both.
 */
function normalizeRecurringPattern(
  raw: any,
  anchorDate: string,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;

  let frequency: string = raw.frequency ?? raw.pattern ?? "weekly";
  if (frequency === "biweekly") frequency = "weekly";

  const anchor = new Date(anchorDate + "T12:00:00");
  const dow = anchor.getDay();

  let days: number[] | undefined = raw.days ?? raw.days_of_week;
  if (!days && frequency === "weekly") {
    days = [dow];
  }

  const endDate: string | undefined = raw.end_date || undefined;

  return { frequency, days, end_date: endDate };
}

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
    const locationId = searchParams.get('location_id');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // When location_id is provided, restrict to staff assigned to that location
    let staffIdsAtLocation: string[] | null = null;
    if (locationId) {
      const { data: assignments, error: assignmentError } = await supabase
        .from("provider_staff_locations")
        .select("staff_id")
        .eq("location_id", locationId);
      if (assignmentError) throw assignmentError;
      staffIdsAtLocation = assignments?.map((a) => a.staff_id) ?? [];
      // No rows in provider_staff_locations for this salon: do not hide all blocks — show provider-wide + unassigned.
      if (staffIdsAtLocation.length === 0) {
        staffIdsAtLocation = null;
      }
    }

    const selectColumns = `
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
      `;

    const applyStaffScope = (q: any) => {
      if (staffId) {
        return q.eq("staff_id", staffId);
      }
      if (staffIdsAtLocation && staffIdsAtLocation.length > 0) {
        return q.or(`staff_id.is.null,staff_id.in.(${staffIdsAtLocation.join(",")})`);
      }
      return q;
    };

    let timeBlocks: any[] = [];

    if (dateFrom && dateTo) {
      let qRange = supabase
        .from("time_blocks")
        .select(selectColumns)
        .eq("provider_id", providerId);
      qRange = applyStaffScope(qRange);
      qRange = qRange.gte("date", dateFrom).lte("date", dateTo).order("date", { ascending: true });

      let qRecurring = supabase
        .from("time_blocks")
        .select(selectColumns)
        .eq("provider_id", providerId)
        .eq("is_recurring", true)
        .lte("date", dateTo);
      qRecurring = applyStaffScope(qRecurring);
      qRecurring = qRecurring.order("date", { ascending: true });

      const [resRange, resRecurring] = await Promise.all([qRange, qRecurring]);
      if (resRange.error) throw resRange.error;
      if (resRecurring.error) throw resRecurring.error;

      const byId = new Map<string, any>();
      for (const row of resRange.data || []) byId.set(row.id, row);
      for (const row of resRecurring.data || []) byId.set(row.id, row);
      timeBlocks = Array.from(byId.values()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      );
    } else {
      let query = supabase
        .from("time_blocks")
        .select(selectColumns)
        .eq("provider_id", providerId);
      query = applyStaffScope(query);
      if (dateFrom) {
        query = query.gte("date", dateFrom);
      }
      if (dateTo) {
        query = query.lte("date", dateTo);
      }
      query = query.order("date", { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      timeBlocks = data || [];
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
      start_time: String(block.start_time ?? "00:00:00").substring(0, 5),
      end_time: String(block.end_time ?? "00:00:00").substring(0, 5),
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
    const permissionCheck = await requireAnyPermission(["edit_settings", "edit_appointments"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

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

    const isRecurring = data.is_recurring || false;
    const normalizedPattern = isRecurring
      ? normalizeRecurringPattern(data.recurring_pattern, data.date)
      : null;

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
        is_recurring: isRecurring,
        recurring_pattern: normalizedPattern,
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
