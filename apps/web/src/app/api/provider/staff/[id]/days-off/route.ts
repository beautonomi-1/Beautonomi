import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { isProviderOwner } from "@/lib/auth/permissions";
import { isMissingRelationError, migrationRequiredResponse } from "@/lib/supabase/migration-required";
import { z } from "zod";

const createDayOffSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  reason: z.string().optional(),
  type: z.string().optional(),
});

async function canAccessStaffDaysOff(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  providerId: string,
  routeStaffId: string,
  userId: string,
  request: NextRequest,
  write: boolean,
) {
  const resolvedStaffId = await resolveProviderStaffRowId(supabase, providerId, routeStaffId);
  if (!resolvedStaffId) return { ok: false as const, reason: "not_found" as const };

  const owner = await isProviderOwner(userId, request);
  if (owner) return { ok: true as const, staffId: resolvedStaffId };

  const { data: selfStaff } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (selfStaff?.id === resolvedStaffId) {
    return { ok: true as const, staffId: resolvedStaffId };
  }

  if (!write) {
    const viewCheck = await requirePermission("view_team", request);
    if (viewCheck.authorized) return { ok: true as const, staffId: resolvedStaffId };
    return { ok: false as const, reason: "forbidden" as const };
  }

  const manageCheck = await requirePermission("manage_team", request);
  if (manageCheck.authorized) return { ok: true as const, staffId: resolvedStaffId };
  return { ok: false as const, reason: "forbidden" as const };
}

/**
 * GET /api/provider/staff/[id]/days-off
 * 
 * Get days off for a staff member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission("view_calendar", request);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }
    const { user } = authCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const access = await canAccessStaffDaysOff(supabase, providerId, id, user.id, request, false);
    if (!access.ok) {
      if (access.reason === "not_found") return notFoundResponse("Staff member not found");
      return errorResponse("Permission denied", "FORBIDDEN", 403);
    }

    let query = supabase
      .from("staff_days_off")
      .select("*")
      .eq("staff_id", access.staffId)
      .order("date", { ascending: true });

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data: daysOff, error } = await query;

    if (error) {
      if (isMissingRelationError(error)) {
        return migrationRequiredResponse("Staff days off");
      }
      throw error;
    }

    return successResponse(daysOff || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch days off");
  }
}

/**
 * POST /api/provider/staff/[id]/days-off
 * 
 * Create a day off for a staff member
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission("view_calendar", request);
    if (!authCheck.authorized) {
      return authCheck.response!;
    }
    const { user } = authCheck;
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json();

    // Validate input
    const validationResult = createDayOffSchema.safeParse(body);
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

    const access = await canAccessStaffDaysOff(supabase, providerId, id, user.id, request, true);
    if (!access.ok) {
      if (access.reason === "not_found") return notFoundResponse("Staff member not found");
      return errorResponse("Permission denied", "FORBIDDEN", 403);
    }

    const { data: existing } = await supabase
      .from("staff_days_off")
      .select("id")
      .eq("staff_id", access.staffId)
      .eq("date", validationResult.data.date)
      .maybeSingle();

    if (existing) {
      return errorResponse("Day off already exists for this date", "DUPLICATE_ERROR", 400);
    }

    // Create day off
    const { data: dayOff, error: insertError } = await supabase
      .from("staff_days_off")
      .insert({
        staff_id: access.staffId,
        provider_id: providerId,
        date: validationResult.data.date,
        reason: validationResult.data.reason || null,
        type: validationResult.data.type || null,
      })
      .select()
      .single();

    if (insertError) {
      if (isMissingRelationError(insertError)) {
        return migrationRequiredResponse("Staff days off");
      }
      throw insertError;
    }

    // Keep the broader availability/conflict table in sync with the simple
    // mobile "day off" table. Reschedule conflict checks read staff_time_off.
    try {
      await supabase
        .from("staff_time_off")
        .delete()
        .eq("staff_id", access.staffId)
        .eq("provider_id", providerId)
        .eq("start_date", validationResult.data.date)
        .eq("end_date", validationResult.data.date);
      await supabase.from("staff_time_off").insert({
        staff_id: id,
        provider_id: providerId,
        start_date: validationResult.data.date,
        end_date: validationResult.data.date,
        reason: validationResult.data.reason || null,
        type: validationResult.data.type || "day_off",
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      });
    } catch (syncError) {
      console.warn("Failed to sync staff_time_off for day off:", syncError);
    }

    return successResponse(dayOff);
  } catch (error) {
    return handleApiError(error, "Failed to create day off");
  }
}

// DELETE is implemented in ./[dayOffId]/route.ts — this segment has no dayOffId param.
