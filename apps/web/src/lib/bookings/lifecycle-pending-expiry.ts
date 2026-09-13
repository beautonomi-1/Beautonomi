import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCustomerInitiatedOnlinePending,
  isPendingExpireDue,
  resolveLifecycleProviderSettings,
  resolvePendingExpireDecision,
  buildPendingExpiryRefundCopy,
  pendingExpiryCancellationReason,
  type PendingExpireBound,
  type WorkingHoursJson,
} from "@/lib/bookings/lifecycle-deadlines";
import {
  cancelPendingBookingRequest,
  type PendingCancelReason,
} from "@/lib/bookings/cancel-pending-booking-request";
import { sendCancellationNotification } from "@/lib/bookings/notifications";

export type PendingBookingRow = {
  id: string;
  created_at: string;
  scheduled_at: string;
  booking_source?: string | null;
  recurring_series_id?: string | null;
  status: string;
  provider_id?: string | null;
  location_id?: string | null;
  group_booking_id?: string | null;
  payment_status?: string | null;
};

type ProviderLifecycleRow = {
  id: string;
  timezone?: string | null;
  confirmation_sla_hours?: number | null;
  unconfirmed_expire_hours_before_slot?: number | null;
};

const workingHoursCache = new Map<string, WorkingHoursJson | null>();

export async function loadLocationWorkingHours(
  admin: SupabaseClient,
  providerId: string,
  locationId?: string | null,
): Promise<WorkingHoursJson | null> {
  const cacheKey = `${providerId}:${locationId ?? "primary"}`;
  if (workingHoursCache.has(cacheKey)) {
    return workingHoursCache.get(cacheKey) ?? null;
  }

  let query = admin
    .from("provider_locations")
    .select("working_hours")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  if (locationId) {
    query = query.eq("id", locationId);
  } else {
    query = query.order("is_primary", { ascending: false }).order("created_at", { ascending: true });
  }

  const { data, error } = await query.limit(1);
  if (error || !data?.length) {
    workingHoursCache.set(cacheKey, null);
    return null;
  }

  const raw = data[0].working_hours;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    workingHoursCache.set(cacheKey, null);
    return null;
  }

  const wh = raw as WorkingHoursJson;
  const resolved = Object.keys(wh).length > 0 ? wh : null;
  workingHoursCache.set(cacheKey, resolved);
  return resolved;
}

export async function loadProviderLifecycleSettings(
  admin: SupabaseClient,
  providerId: string,
): Promise<ProviderLifecycleRow | null> {
  const { data, error } = await admin
    .from("providers")
    .select(
      "id, timezone, confirmation_sla_hours, unconfirmed_expire_hours_before_slot",
    )
    .eq("id", providerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProviderLifecycleRow;
}

export async function computeExpireAtForPendingBooking(
  admin: SupabaseClient,
  row: PendingBookingRow,
  provider?: ProviderLifecycleRow | null,
): Promise<Date> {
  const decision = await computeExpireDecisionForPendingBooking(admin, row, provider);
  return decision.expireAt;
}

export async function computeExpireDecisionForPendingBooking(
  admin: SupabaseClient,
  row: PendingBookingRow,
  provider?: ProviderLifecycleRow | null,
) {
  const providerRow =
    provider ??
    (row.provider_id
      ? await loadProviderLifecycleSettings(admin, row.provider_id)
      : null);
  const workingHours =
    row.provider_id != null
      ? await loadLocationWorkingHours(admin, row.provider_id, row.location_id)
      : null;

  return resolvePendingExpireDecision({
    createdAt: row.created_at,
    scheduledAt: row.scheduled_at,
    workingHours,
    timezone: providerRow?.timezone,
    settings: resolveLifecycleProviderSettings(providerRow ?? undefined),
  });
}

export function isEligiblePreSlotPendingRow(row: PendingBookingRow): boolean {
  return isCustomerInitiatedOnlinePending({
    status: row.status,
    bookingSource: row.booking_source,
    recurringSeriesId: row.recurring_series_id,
  });
}

export async function filterDuePreSlotPendingBookings(
  admin: SupabaseClient,
  rows: PendingBookingRow[],
  now = new Date(),
): Promise<Array<PendingBookingRow & { expireAt: Date; expireReason: PendingExpireBound }>> {
  const providerCache = new Map<string, ProviderLifecycleRow | null>();
  const due: Array<PendingBookingRow & { expireAt: Date; expireReason: PendingExpireBound }> = [];

  for (const row of rows) {
    if (!isEligiblePreSlotPendingRow(row)) continue;
    const providerId = row.provider_id;
    if (!providerId) continue;

    let provider = providerCache.get(providerId);
    if (provider === undefined) {
      provider = await loadProviderLifecycleSettings(admin, row.provider_id);
      providerCache.set(providerId, provider);
    }

    const decision = await computeExpireDecisionForPendingBooking(admin, row, provider);
    if (isPendingExpireDue({ now, expireAt: decision.expireAt, scheduledAt: row.scheduled_at })) {
      due.push({ ...row, expireAt: decision.expireAt, expireReason: decision.reason });
    }
  }

  return due;
}

export async function groupHasConfirmedChild(
  admin: SupabaseClient,
  groupBookingId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("group_booking_id", groupBookingId)
    .eq("status", "confirmed");

  if (error) {
    console.error("[lifecycle-pending-expiry] group confirmed-child lookup failed", groupBookingId, error);
    throw error;
  }
  return (count ?? 0) > 0;
}

export function isPendingGroupSiblingEligibleForExpiry(sibling: {
  recurring_series_id?: string | null;
}): boolean {
  return !sibling.recurring_series_id;
}

/**
 * Resolve the booking row that represents the group organiser / primary contact.
 * Used so expiry notifications go to whoever booked the group, not an arbitrary sibling.
 */
export async function resolveGroupOrganiserBookingId(
  admin: SupabaseClient,
  groupBookingId: string,
): Promise<string | null> {
  const { data: group, error: groupError } = await admin
    .from("group_bookings")
    .select("primary_contact_booking_id")
    .eq("id", groupBookingId)
    .maybeSingle();

  if (groupError) {
    console.error("[lifecycle-pending-expiry] group lookup failed", groupBookingId, groupError);
  }

  const primaryId = (group as { primary_contact_booking_id?: string | null } | null)
    ?.primary_contact_booking_id;
  if (primaryId) return primaryId;

  const { data: participant, error: participantError } = await admin
    .from("booking_participants")
    .select("booking_id")
    .eq("group_booking_id", groupBookingId)
    .eq("is_primary_contact", true)
    .not("booking_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (participantError) {
    console.error(
      "[lifecycle-pending-expiry] primary participant lookup failed",
      groupBookingId,
      participantError,
    );
  }

  const participantBookingId = (participant as { booking_id?: string | null } | null)?.booking_id;
  if (participantBookingId) return participantBookingId;

  const { data: firstBooking, error: bookingError } = await admin
    .from("bookings")
    .select("id")
    .eq("group_booking_id", groupBookingId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (bookingError) {
    console.error(
      "[lifecycle-pending-expiry] fallback organiser booking lookup failed",
      groupBookingId,
      bookingError,
    );
  }

  return (firstBooking as { id?: string } | null)?.id ?? null;
}

export async function cancelGroupPendingParticipants(
  admin: SupabaseClient,
  groupBookingId: string,
  siblings: Array<{
    id: string;
    payment_status?: string | null;
    recurring_series_id?: string | null;
  }>,
  reason: PendingCancelReason,
): Promise<{ expired: number; skipped: number; notified: boolean }> {
  const eligible = siblings.filter(isPendingGroupSiblingEligibleForExpiry);
  const skippedIneligible = siblings.length - eligible.length;
  const organiserBookingId = await resolveGroupOrganiserBookingId(admin, groupBookingId);
  const organiserStillPending = eligible.some((sibling) => sibling.id === organiserBookingId);
  let organiserPaymentStatus: string | null | undefined;
  let organiserWalletRefund: number | undefined;
  let organiserCurrency: string | null | undefined;
  let expired = 0;
  let skipped = skippedIneligible;

  for (const sibling of eligible) {
    if (sibling.id === organiserBookingId) {
      organiserPaymentStatus = sibling.payment_status;
    }
    const outcome = await cancelPendingBookingRequest(admin, sibling.id, {
      reason,
      paymentStatus: sibling.payment_status,
      notify: !organiserStillPending,
    });
    if (outcome.ok) {
      expired += 1;
      if (sibling.id === organiserBookingId) {
        organiserWalletRefund = outcome.walletRefundAmount;
        organiserCurrency = outcome.currency;
      }
    } else {
      skipped += 1;
    }
  }

  let notified = !organiserStillPending && expired > 0;
  if (expired > 0 && organiserStillPending && organiserBookingId) {
    if (organiserPaymentStatus === undefined || organiserCurrency === undefined) {
      const { data: organiserRow } = await admin
        .from("bookings")
        .select("payment_status, currency")
        .eq("id", organiserBookingId)
        .maybeSingle();
      const row = organiserRow as { payment_status?: string | null; currency?: string | null } | null;
      organiserPaymentStatus = organiserPaymentStatus ?? row?.payment_status;
      organiserCurrency = organiserCurrency ?? row?.currency;
    }

    const cancellationReason = pendingExpiryCancellationReason(reason);
    try {
      await sendCancellationNotification(organiserBookingId, {
        cancelledBy: "system",
        cancellationReason,
        refundInfo: buildPendingExpiryRefundCopy(organiserPaymentStatus),
        feeRetained: 0,
        walletRefund: organiserWalletRefund,
        currency: organiserCurrency ?? undefined,
      });
      notified = true;
    } catch (err) {
      console.error(
        "[lifecycle-pending-expiry] organiser expiry notification failed",
        organiserBookingId,
        err,
      );
    }
  }

  return { expired, skipped, notified };
}
