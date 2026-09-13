import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";
import { formatBookingDate, formatBookingTime } from "@/lib/notifications/notification-service";
import { insertNotification } from "@/lib/notifications/insert-notification";
import {
  computeExpireAtForPendingBooking,
  isEligiblePreSlotPendingRow,
  loadProviderLifecycleSettings,
} from "@/lib/bookings/lifecycle-pending-expiry";
import { isExpiringSoonPending, resolvePendingNudgeKind } from "@/lib/bookings/lifecycle-deadlines";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { EVENT_PENDING_REQUEST_NUDGE_SENT } from "@/lib/analytics/amplitude/types";

export const PENDING_NUDGE_TEMPLATE_KEY = "provider_booking_request_reminder";
export type { PendingNudgeKind } from "@/lib/bookings/lifecycle-deadlines";
export { resolvePendingNudgeKind };

type PendingRow = {
  id: string;
  created_at: string;
  scheduled_at: string;
  booking_source?: string | null;
  recurring_series_id?: string | null;
  status: string;
  provider_id?: string | null;
  location_id?: string | null;
  tenant_id?: string | null;
  customer_id?: string | null;
};

/**
 * Dedupe on the in-app `notifications` row we insert ourselves. The template
 * dispatcher's auto-insert only persists well-known variables (not
 * `reminder_key`) and `insertNotification` maps unknown `type`s to "system",
 * so we deliberately match on `user_id` + `data.reminder_key` only.
 */
async function nudgeAlreadySent(
  admin: SupabaseClient,
  userId: string,
  reminderKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .contains("data", { reminder_key: reminderKey })
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function resolveProviderRecipientsForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<string[]> {
  const { resolveBookingProviderRecipients } = await import(
    "@/lib/notifications/resolve-booking-notification-recipients"
  );
  const { getProviderStaffUserIds, getProviderTeamUserIds } = await import(
    "@/lib/notifications/notify-provider-team"
  );

  const { data: booking } = await admin
    .from("bookings")
    .select("id, provider_id, providers!inner(user_id), booking_services(staff_id)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return [];
  const provider = (booking as { providers?: { user_id?: string | null } }).providers;
  const assignedStaffIds = (
    (booking as { booking_services?: Array<{ staff_id?: string | null }> }).booking_services ?? []
  )
    .map((s) => s.staff_id)
    .filter(Boolean) as string[];

  const { recipients } = await resolveBookingProviderRecipients({
    providerId: (booking as { provider_id?: string }).provider_id,
    ownerUserId: provider?.user_id,
    assignedStaffIds,
    loaders: {
      loadStaffUserIds: getProviderStaffUserIds,
      loadTeamUserIds: getProviderTeamUserIds,
    },
  });
  return recipients;
}

async function loadBookingNudgeContext(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin
    .from("bookings")
    .select(
      `
      id,
      scheduled_at,
      tenant_id,
      customer:users!bookings_customer_id_fkey(full_name),
      providers!inner(business_name, timezone),
      booking_services(offering:offerings(title))
    `,
    )
    .eq("id", bookingId)
    .maybeSingle();
  return data as
    | {
        id: string;
        scheduled_at: string;
        tenant_id?: string | null;
        customer?: { full_name?: string | null } | null;
        providers?: { business_name?: string | null; timezone?: string | null } | null;
        booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;
      }
    | null;
}

export async function sendPendingConfirmationNudges(limit = 100): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  deferred_quiet_hours: number;
}> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const lookbackIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("bookings")
    .select(
      "id, created_at, scheduled_at, booking_source, recurring_series_id, status, provider_id, location_id, tenant_id, customer_id",
    )
    .eq("status", "pending")
    .eq("booking_source", "online")
    .is("recurring_series_id", null)
    .gt("scheduled_at", now.toISOString())
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let deferredQuietHours = 0;
  const providerCache = new Map<
    string,
    Awaited<ReturnType<typeof loadProviderLifecycleSettings>>
  >();

  for (const raw of (rows ?? []) as PendingRow[]) {
    if (!isEligiblePreSlotPendingRow(raw) || !raw.provider_id) {
      skipped += 1;
      continue;
    }

    let provider = providerCache.get(raw.provider_id);
    if (provider === undefined) {
      provider = await loadProviderLifecycleSettings(admin, raw.provider_id);
      providerCache.set(raw.provider_id, provider);
    }

    const expireAt = await computeExpireAtForPendingBooking(admin, raw, provider);
    const nudgeKind = resolvePendingNudgeKind({
      now,
      createdAt: new Date(raw.created_at),
      expireAt,
    });
    if (!nudgeKind) {
      skipped += 1;
      continue;
    }

    const reminderKey = `pending_confirm_${nudgeKind}_${raw.id}`;
    const recipients = await resolveProviderRecipientsForBooking(admin, raw.id);
    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }

    const pendingRecipients: string[] = [];
    for (const recipientId of recipients) {
      if (!(await nudgeAlreadySent(admin, recipientId, reminderKey))) {
        pendingRecipients.push(recipientId);
      }
    }
    if (pendingRecipients.length === 0) {
      skipped += 1;
      continue;
    }

    const ctx = await loadBookingNudgeContext(admin, raw.id);
    if (!ctx) {
      skipped += 1;
      continue;
    }

    const tz = ctx.providers?.timezone ?? undefined;
    const serviceName =
      ctx.booking_services?.map((s) => s.offering?.title).filter(Boolean).join(", ") ||
      "Appointment";
    const expireTime = formatBookingTime(expireAt.toISOString(), tz);
    const title =
      nudgeKind === "before_expire" ? "Booking request expiring soon" : "Booking request waiting";
    const message = `${ctx.customer?.full_name ?? "Customer"} requested ${serviceName} on ${formatBookingDate(
      ctx.scheduled_at,
      tz,
    )} at ${formatBookingTime(ctx.scheduled_at, tz)}. Confirm or decline before ${expireTime}.`;

    // Push first (skipInApp: we own the bell row for dedupe). If every recipient
    // is inside quiet hours the dispatcher suppresses push and tells us — in that
    // case we do NOT write the dedupe row, so the next run retries after quiet hours.
    const result = await dispatchTemplateNotification(
      PENDING_NUDGE_TEMPLATE_KEY,
      pendingRecipients,
      {
        tenant_id: ctx.tenant_id ?? "",
        customer_name: ctx.customer?.full_name ?? "Customer",
        service_name: serviceName,
        date: formatBookingDate(ctx.scheduled_at, tz),
        time: formatBookingTime(ctx.scheduled_at, tz),
        expire_time: expireTime,
        booking_id: raw.id,
      },
      ["push"],
      { appType: "provider", skipInApp: true },
    );

    if ((result as { notification_id?: string } | null)?.notification_id === "suppressed-quiet-hours") {
      deferredQuietHours += 1;
      continue;
    }

    for (const recipientId of pendingRecipients) {
      await insertNotification({
        user_id: recipientId,
        type: "new_appointment",
        title,
        message,
        data: {
          booking_id: raw.id,
          reminder_key: reminderKey,
          nudge_kind: nudgeKind,
          template_key: PENDING_NUDGE_TEMPLATE_KEY,
        },
        action_url: `/provider/bookings/${raw.id}?action=confirm`,
      });
    }

    try {
      await trackServer(
        EVENT_PENDING_REQUEST_NUDGE_SENT,
        { booking_id: raw.id, provider_id: raw.provider_id, nudge_kind: nudgeKind, recipients: pendingRecipients.length },
        undefined,
        { insertId: `pending_request_nudge_sent:${reminderKey}` },
      );
    } catch {
      // analytics is non-blocking
    }

    sent += 1;
  }

  return { scanned: rows?.length ?? 0, sent, skipped, deferred_quiet_hours: deferredQuietHours };
}

export async function countExpiringSoonPendingForProvider(
  admin: SupabaseClient,
  providerId: string,
  locationId?: string | null,
): Promise<number> {
  let query = admin
    .from("bookings")
    .select(
      "id, created_at, scheduled_at, booking_source, recurring_series_id, status, provider_id, location_id",
    )
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .eq("booking_source", "online")
    .is("recurring_series_id", null)
    .gt("scheduled_at", new Date().toISOString())
    .limit(100);

  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  const { data } = await query;
  const now = new Date();
  const provider = await loadProviderLifecycleSettings(admin, providerId);
  let count = 0;

  for (const row of (data ?? []) as PendingRow[]) {
    if (!isEligiblePreSlotPendingRow(row)) continue;
    const expireAt = await computeExpireAtForPendingBooking(admin, row, provider);
    if (isExpiringSoonPending({ now, expireAt, withinHours: 2 })) count += 1;
  }

  return count;
}
