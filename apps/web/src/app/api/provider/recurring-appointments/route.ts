import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import { createBookingFromRecurringSeries } from "@/lib/recurring/create-booking-from-series";
import {
  ADVANCED_RECURRENCE_UPGRADE,
  SUBSCRIPTION_UPGRADE_SHORT,
} from "@/lib/subscriptions/subscription-upgrade-copy";
import { isAdvancedRecurrenceRule } from "@/lib/recurring/advanced-rrule";
import { z } from "zod";

const createRecurringSchema = z.object({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional().nullable(),
  recurrence_rule: z.string().min(1, "Recurrence rule is required"), // RRULE format
  start_date: z.string().date(), // DATE format
  end_date: z.string().date().optional(), // DATE format
  start_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "Time must be in HH:MM:SS format"), // TIME format
  notes: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  frequency: z.string().min(1).optional().nullable(),
  preferred_time: z.string().optional().nullable(),
  location_type: z.enum(["at_salon", "at_home"]).optional().nullable(),
  payment_method: z.enum(["card", "cash"]).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/provider/recurring-appointments
 * 
 * List provider's recurring appointments
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows recurring appointments
    const recurringAccess = await checkRecurringAppointmentFeatureAccess(providerId, supabase);
    if (!recurringAccess.enabled) {
      return errorResponse(SUBSCRIPTION_UPGRADE_SHORT, "SUBSCRIPTION_REQUIRED", 403);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const locationId = searchParams.get("location_id");

    let listQuery = supabase
      .from("recurring_appointments")
      .select(
        `
        *,
        customer:users!recurring_appointments_customer_id_fkey(full_name),
        offering:offerings!recurring_appointments_service_id_fkey(title),
        staff:provider_staff!recurring_appointments_staff_id_fkey(name)
      `,
        { count: "exact" }
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (locationId) {
      listQuery = listQuery.or(`location_id.eq.${locationId},location_id.is.null`);
    }

    const { data: appointments, error, count } = await listQuery;

    if (error) {
      throw error;
    }

    const rows = appointments || [];
    const enriched = rows.map((row: any) => ({
      ...row,
      client_snapshot_name: row.customer?.full_name || "Client",
      service_snapshot_title: row.offering?.title || "",
      staff_snapshot_name: row.staff?.name || "",
    }));

    return successResponse({
      data: enriched,
      total: count || 0,
      page,
      total_pages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch recurring appointments");
  }
}

/**
 * POST /api/provider/recurring-appointments
 * 
 * Create a new recurring appointment
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Check subscription allows recurring appointments
    const recurringAccess = await checkRecurringAppointmentFeatureAccess(providerId, supabase);
    if (!recurringAccess.enabled) {
      return errorResponse(SUBSCRIPTION_UPGRADE_SHORT, "SUBSCRIPTION_REQUIRED", 403);
    }

    const body = await request.json();
    const validated = createRecurringSchema.parse(body);

    const isAdvancedPattern = isAdvancedRecurrenceRule(validated.recurrence_rule);

    if (isAdvancedPattern && !recurringAccess.advancedPatterns) {
      return errorResponse(
        ADVANCED_RECURRENCE_UPGRADE,
        "SUBSCRIPTION_REQUIRED",
        403
      );
    }

    const { data: appointment, error } = await supabase
      .from("recurring_appointments")
      .insert({
        provider_id: providerId,
        ...validated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const admin = getSupabaseAdmin();
    const initialVisit = await createBookingFromRecurringSeries(
      admin,
      appointment as any,
      validated.start_date
    );
    const warnings: string[] = [];
    if ("bookingId" in initialVisit) {
      await admin
        .from("recurring_appointments")
        .update({ last_booking_date: validated.start_date, updated_at: new Date().toISOString() })
        .eq("id", appointment.id);
    } else {
      warnings.push(`Recurring series was created, but the first calendar visit was not created: ${initialVisit.error}`);
    }

    return successResponse({
      ...appointment,
      last_booking_date: "bookingId" in initialVisit ? validated.start_date : appointment.last_booking_date,
      _warnings: warnings,
      _initial_booking_id: "bookingId" in initialVisit ? initialVisit.bookingId : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create recurring appointment");
  }
}
