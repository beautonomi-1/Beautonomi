import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/reports/schedule
 * 
 * Schedule a report to be generated and sent automatically
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { report_type, frequency, day_of_week, day_of_month, time, recipients, format } = body;

    if (!report_type || !frequency || !recipients || !format) {
      return errorResponse("Missing required fields: report_type, frequency, recipients, format", "VALIDATION_ERROR", 400);
    }

    const scheduleData: any = {
      provider_id: providerId,
      report_type,
      frequency, // daily, weekly, monthly
      day_of_week: day_of_week || null,
      day_of_month: day_of_month || null,
      time: time || "09:00",
      recipients: Array.isArray(recipients) ? recipients : [recipients],
      format, // csv, pdf
      is_active: true,
      created_by: user.id,
    };

    // Check if schedule already exists for this report type
    const { data: existing } = await supabase
      .from("report_schedules")
      .select("id")
      .eq("provider_id", providerId)
      .eq("report_type", report_type)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      // Update existing schedule
      const { data: schedule, error } = await supabase
        .from("report_schedules")
        .update(scheduleData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return successResponse(schedule);
    } else {
      // Create new schedule
      const { data: schedule, error } = await supabase
        .from("report_schedules")
        .insert(scheduleData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return successResponse(schedule, 201);
    }
  } catch (error: any) {
    console.error("Error scheduling report:", error);
    return handleApiError(error, "Failed to schedule report");
  }
}

/**
 * GET /api/provider/reports/schedule
 * 
 * Get all scheduled reports for the provider
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { data: schedules, error } = await supabase
      .from("report_schedules")
      .select("*")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(schedules || []);
  } catch (error: any) {
    console.error("Error fetching scheduled reports:", error);
    return handleApiError(error, "Failed to fetch scheduled reports");
  }
}
