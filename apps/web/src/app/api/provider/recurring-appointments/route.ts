import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Creating up to 12 initial bookings serially can exceed the default 10-second
// Vercel function budget. Allow up to 60 seconds.
export const maxDuration = 60;
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import { createBookingFromRecurringSeries } from "@/lib/recurring/create-booking-from-series";
import {
  ADVANCED_RECURRENCE_UPGRADE,
  SUBSCRIPTION_UPGRADE_SHORT,
} from "@/lib/subscriptions/subscription-upgrade-copy";
import { isAdvancedRecurrenceRule } from "@/lib/recurring/advanced-rrule";
import { isDateOnOrBeforeEnd, nextRecurringOccurrenceDate } from "@/lib/recurring/next-due-date";
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
  occurrences: z.number().int().positive().optional().nullable(),
  preferred_time: z.string().optional().nullable(),
  location_type: z.enum(["at_salon", "at_home"]).optional().nullable(),
  payment_method: z
    .enum(["card", "cash", "pay_later", "yoco_pos", "payment_link"])
    .optional()
    .nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function occurrenceCountFromRule(rule: string): number | null {
  const match = rule.toUpperCase().match(/(?:^|;)COUNT=(\d+)(?:;|$)/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
}

function buildInitialOccurrenceDates(params: {
  startDate: string;
  frequency?: string | null;
  recurrenceRule?: string | null;
  endDate?: string | null;
  occurrences?: number | null;
}): string[] {
  const maxInitialVisits = 12;
  const requestedCount = params.occurrences && params.occurrences > 0 ? Math.floor(params.occurrences) : null;
  const limit = requestedCount ? Math.min(requestedCount, maxInitialVisits) : maxInitialVisits;
  const dates: string[] = [];
  let last: string | null = null;

  for (let i = 0; i < limit; i++) {
    const next = nextRecurringOccurrenceDate({
      startDate: params.startDate,
      lastBookingDate: last,
      frequency: params.frequency,
      recurrenceRule: params.recurrenceRule,
    });
    if (!next) break;
    if (!isDateOnOrBeforeEnd(next, params.endDate)) break;
    dates.push(next);
    last = next;
  }

  return dates;
}

/**
 * GET /api/provider/recurring-appointments
 * 
 * List provider's recurring appointments
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_calendar", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
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
    const search = (searchParams.get("search") || "").trim().toLowerCase();

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
      .order("created_at", { ascending: false });

    if (locationId) {
      listQuery = listQuery.or(`location_id.eq.${locationId},location_id.is.null`);
    }
    if (!search) {
      listQuery = listQuery.range(offset, offset + limit - 1);
    } else {
      listQuery = listQuery.limit(500);
    }

    const { data: appointments, error, count } = await listQuery;

    if (error) {
      throw error;
    }

    const rows = appointments || [];
    const enrichedAll = rows.map((row: any) => ({
      ...row,
      service: row.offering || null,
      client_snapshot_name: row.customer?.full_name || "Client",
      service_snapshot_title: row.offering?.title || "",
      staff_snapshot_name: row.staff?.name || "",
    }));
    const filtered = search
      ? enrichedAll.filter((row: any) => {
          const haystack = [
            row.client_snapshot_name,
            row.service_snapshot_title,
            row.staff_snapshot_name,
            row.notes,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : enrichedAll;
    const paged = search ? filtered.slice(offset, offset + limit) : filtered;
    const total = search ? filtered.length : count || 0;

    return successResponse({
      data: paged,
      total,
      page,
      total_pages: Math.max(1, Math.ceil(total / limit)),
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
    const permissionCheck = await requirePermission("create_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = getSupabaseAdmin();
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
    const metadata = {
      ...(validated.metadata ?? {}),
      booking_source: "provider",
      services:
        Array.isArray((validated.metadata as { services?: unknown[] } | undefined)?.services)
          ? (validated.metadata as { services?: unknown[] }).services
          : validated.service_id
            ? [{ offering_id: validated.service_id, staff_id: validated.staff_id ?? null }]
            : undefined,
    };
    const requestedOccurrences =
      validated.occurrences ?? occurrenceCountFromRule(validated.recurrence_rule);

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
        metadata,
        occurrences: requestedOccurrences,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const admin = getSupabaseAdmin();
    const initialOccurrenceDates = buildInitialOccurrenceDates({
      startDate: validated.start_date,
      frequency: validated.frequency,
      recurrenceRule: validated.recurrence_rule,
      endDate: validated.end_date,
      occurrences: requestedOccurrences,
    });
    const warnings: string[] = [];
    const createdBookingIds: string[] = [];
    let lastCreatedDate: string | null = null;

    // Run all initial occurrence bookings in parallel to stay within the 60-second
    // function budget (serial loop of 12 DB writes could breach the old 25-second limit).
    const results = await Promise.allSettled(
      initialOccurrenceDates.map((occurrenceDate) =>
        createBookingFromRecurringSeries(admin, appointment as any, occurrenceDate).then(
          (created) => ({ occurrenceDate, created }),
        ),
      ),
    );

    // Preserve date order for lastCreatedDate tracking.
    for (let i = 0; i < initialOccurrenceDates.length; i++) {
      const r = results[i];
      const occurrenceDate = initialOccurrenceDates[i];
      if (r.status === "fulfilled") {
        const { created } = r.value;
        if ("bookingId" in created) {
          createdBookingIds.push(created.bookingId);
          lastCreatedDate = occurrenceDate;
        } else {
          warnings.push(`Visit on ${occurrenceDate} was not created: ${created.error}`);
        }
      } else {
        warnings.push(`Visit on ${occurrenceDate} failed: ${r.reason}`);
      }
    }

    if (lastCreatedDate) {
      await admin
        .from("recurring_appointments")
        .update({ last_booking_date: lastCreatedDate, updated_at: new Date().toISOString() })
        .eq("id", appointment.id);
    }

    return successResponse({
      ...appointment,
      occurrences: requestedOccurrences,
      last_booking_date: lastCreatedDate ?? appointment.last_booking_date,
      _warnings: warnings,
      _initial_booking_id: createdBookingIds[0] ?? null,
      _created_booking_ids: createdBookingIds,
      _created_occurrence_count: createdBookingIds.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", 400);
    }
    return handleApiError(error, "Failed to create recurring appointment");
  }
}
