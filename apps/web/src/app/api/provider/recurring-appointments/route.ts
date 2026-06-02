import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Creating up to 12 initial bookings serially can exceed the default 10-second
// Vercel function budget. Allow up to 60 seconds.
export const maxDuration = 60;
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { checkRecurringAppointmentFeatureAccess } from "@/lib/subscriptions/feature-access";
import { createBookingFromRecurringSeries } from "@/lib/recurring/create-booking-from-series";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import {
  ADVANCED_RECURRENCE_UPGRADE,
  SUBSCRIPTION_UPGRADE_SHORT,
} from "@/lib/subscriptions/subscription-upgrade-copy";
import { isAdvancedRecurrenceRule } from "@/lib/recurring/advanced-rrule";
import { isDateOnOrBeforeEnd, nextRecurringOccurrenceDate } from "@/lib/recurring/next-due-date";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
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

async function sendFirstRecurringPaymentLink(params: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  bookingId: string;
  customerId: string;
}): Promise<{ sent: boolean; disabled?: boolean }> {
  const { admin, bookingId, customerId } = params;
  const { data: booking } = await admin
    .from("bookings")
    .select("id, tenant_id, booking_number, ref_number, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    throw new Error("First recurring visit could not be loaded for payment-link delivery");
  }

  // Feature gate: skip sending when the payment-link method is disabled for this tenant.
  const paymentLinkEnabled = await isFeatureEnabledServer(
    FEATURE_FLAG_KEYS.PAYMENT_LINK,
    (booking as { tenant_id?: string | null }).tenant_id ?? null,
  );
  if (!paymentLinkEnabled) {
    return { sent: false, disabled: true };
  }

  const bookingRef = booking.booking_number || booking.ref_number || bookingId.slice(0, 8).toUpperCase();
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const paymentLink = `${appBase}/bookings/${bookingId}/pay`;
  const amountDue = computeBookingOutstandingDisplay({
    totalAmount: Number(booking.total_amount ?? 0),
    totalPaid: Number(booking.total_paid ?? 0),
    totalRefunded: Number(booking.total_refunded ?? 0),
    walletAmount: Number(booking.wallet_amount ?? 0),
    giftCardAmount: Number(booking.gift_card_amount ?? 0),
    unpaidAdditionalCharges: 0,
    paymentStatus: booking.payment_status,
  });
  const { format: formatMoney } = await getTenantMoneyFormatter(
    (booking as { tenant_id?: string | null }).tenant_id ?? null,
  );

  const { data: customerContact } = await admin
    .from("users")
    .select("email, phone")
    .eq("id", customerId)
    .maybeSingle();
  const customerEmail = (customerContact as { email?: string | null } | null)?.email;
  const customerPhone = (customerContact as { phone?: string | null } | null)?.phone;

  const { insertNotification } = await import("@/lib/notifications/insert-notification");
  await insertNotification({
    user_id: customerId,
    type: "payment_link_sent",
    title: "Payment Link Ready",
    message: `Pay ${formatMoney(amountDue)} for booking ${bookingRef}. Open: ${paymentLink}`,
    data: {
      booking_id: bookingId,
      booking_ref: bookingRef,
      amount: amountDue,
      payment_link: paymentLink,
      source: "provider_recurring_create",
    },
    action_url: paymentLink,
  });

  const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
  const channels: ("push" | "email" | "sms")[] = ["push"];
  if (customerEmail) channels.push("email");
  if (customerPhone) channels.push("sms");
  await sendTemplateNotification(
    "payment_pending",
    [customerId],
    {
      amount: formatMoney(amountDue),
      booking_number: String(bookingRef),
      payment_method: "Paystack",
      booking_id: bookingId,
      payment_link: paymentLink,
    },
    channels,
    { appType: "customer" },
  );
  return { sent: true };
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

    if (validated.payment_method === "payment_link" && createdBookingIds[0]) {
      try {
        const linkResult = await sendFirstRecurringPaymentLink({
          admin,
          bookingId: createdBookingIds[0],
          customerId: validated.customer_id,
        });
        if (linkResult.disabled) {
          warnings.push("Payment link is disabled, so no link was sent. Collect payment another way.");
        } else if (createdBookingIds.length > 1) {
          warnings.push("Payment link sent for the first generated visit. Future visits remain pending until collected or paid.");
        }
      } catch (paymentLinkError) {
        console.warn("Failed to send payment link for first recurring visit:", paymentLinkError);
        warnings.push("Series created, but the first visit payment link could not be sent automatically. Send it from booking details.");
      }
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
