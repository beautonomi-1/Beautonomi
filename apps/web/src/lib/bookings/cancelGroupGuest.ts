import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelGroupBookingParticipant } from "@/lib/bookings/group-booking-cancellation";
import { repriceBookingAfterLineRemoval } from "@/lib/bookings/repriceBookingAfterLineRemoval";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";

export type CancelGroupGuestResult =
  | {
      ok: true;
      mode: "child_booking" | "booking_lines";
      leadBookingId: string | null;
      removedLines: number;
      /** Returned to the guest's own card (split payment). */
      guestRefunded: number;
      /** Credited to the lead customer's wallet for a guest they had paid for. */
      walletCredited: number;
      /** Still paid on the lead booking beyond its repriced total after automatic refunds. */
      overpaidAmount: number;
    }
  | {
      ok: false;
      code:
        | "PARTICIPANT_NOT_FOUND"
        | "PRIMARY_PARTICIPANT"
        | "BOOKING_CLOSED"
        | "CANCELLATION_WINDOW_CLOSED";
    };

const CLOSED_BOOKING_STATUSES = new Set(["cancelled", "completed", "no_show"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cancel a non-primary group guest.
 *
 * Two storage models exist:
 * - Provider-built groups link each guest to their own child booking → cancel and settle that booking.
 * - Online group checkout stores one lead booking whose `booking_services` lines are tagged with
 *   `group_participant_id` → remove the guest's lines, reprice the lead booking, return the
 *   guest's own payment to their card, and credit the lead customer for anything they had paid
 *   for that guest.
 *
 * Must run before the `booking_participants` row is deleted.
 */
export async function cancelGroupGuest(
  admin: SupabaseClient,
  args: {
    participantId: string;
    groupBookingId: string;
    cancelledBy: string;
    reason?: string;
    /** Guest self-cancel: refuse once the lead booking's free-cancellation window has closed. */
    enforcePolicyWindow?: boolean;
  },
): Promise<CancelGroupGuestResult> {
  const { data: participant } = await admin
    .from("booking_participants")
    .select(
      "id, booking_id, group_booking_id, is_primary_contact, participant_payment_status, participant_name",
    )
    .eq("id", args.participantId)
    .eq("group_booking_id", args.groupBookingId)
    .maybeSingle();
  if (!participant) return { ok: false, code: "PARTICIPANT_NOT_FOUND" };
  if ((participant as { is_primary_contact?: boolean }).is_primary_contact) {
    return { ok: false, code: "PRIMARY_PARTICIPANT" };
  }

  const { data: group } = await admin
    .from("group_bookings")
    .select("primary_contact_booking_id")
    .eq("id", args.groupBookingId)
    .maybeSingle();
  const leadBookingId =
    ((group as { primary_contact_booking_id?: string | null } | null)?.primary_contact_booking_id ?? null) as
      | string
      | null;
  const guestBookingId = ((participant as { booking_id?: string | null }).booking_id ?? null) as string | null;
  const guestName = (participant as { participant_name?: string | null }).participant_name ?? null;
  const reason = args.reason ?? "Removed from group booking";
  const empty = { guestRefunded: 0, walletCredited: 0, overpaidAmount: 0 };

  const notifyRemoved = async () => {
    try {
      const { notifyGroupGuestCancelled } = await import("@/lib/bookings/notify-group-guest-cancelled");
      await notifyGroupGuestCancelled(admin, {
        groupBookingId: args.groupBookingId,
        guestName,
        leadBookingId,
      });
    } catch (err) {
      console.warn("[cancelGroupGuest] notify failed:", err);
    }
  };

  if (guestBookingId && guestBookingId !== leadBookingId) {
    await cancelGroupBookingParticipant(admin, guestBookingId, args.participantId, args.cancelledBy, reason);
    await notifyRemoved();
    return { ok: true, mode: "child_booking", leadBookingId, removedLines: 0, ...empty };
  }

  if (!leadBookingId) {
    return { ok: true, mode: "booking_lines", leadBookingId: null, removedLines: 0, ...empty };
  }

  const { data: leadRow } = await admin
    .from("bookings")
    .select("id, status, currency, tenant_id, booking_number")
    .eq("id", leadBookingId)
    .maybeSingle();
  const lead = (leadRow ?? {}) as {
    status?: string | null;
    currency?: string | null;
    tenant_id?: string | null;
    booking_number?: string | null;
  };
  if (lead.status && CLOSED_BOOKING_STATUSES.has(lead.status)) {
    return { ok: false, code: "BOOKING_CLOSED" };
  }

  if (args.enforcePolicyWindow) {
    const { loadCancellationOutcomeForBooking } = await import(
      "@/lib/bookings/load-cancellation-outcome"
    );
    const { outcome } = await loadCancellationOutcomeForBooking(admin, leadBookingId, "customer");
    if (
      outcome &&
      (!outcome.allowed ||
        (outcome.isLate && outcome.policy?.late_cancellation_type !== "full_refund"))
    ) {
      return { ok: false, code: "CANCELLATION_WINDOW_CLOSED" };
    }
  }

  const { data: removed, error: removeErr } = await admin
    .from("booking_services")
    .delete()
    .eq("booking_id", leadBookingId)
    .eq("group_participant_id", args.participantId)
    .select("id, price");
  if (removeErr) throw removeErr;
  const removedRows = (removed ?? []) as Array<{ price?: number | string | null }>;
  const removedLines = removedRows.length;
  const removedAmount = removedRows.reduce((sum, row) => sum + Number(row.price ?? 0), 0);

  let newTotal: number | null = null;
  if (removedLines > 0) {
    const repriced = await repriceBookingAfterLineRemoval(admin, leadBookingId, removedAmount);
    newTotal = repriced.totalAmount;
  }

  const now = new Date().toISOString();
  await admin
    .from("booking_participants")
    .update({ participant_payment_status: "cancelled", updated_at: now })
    .eq("id", args.participantId);

  const { closeGroupInvitesForParticipant } = await import("@/lib/bookings/group-invites");
  await closeGroupInvitesForParticipant(admin, args.participantId, "cancelled");

  const { tryRecalculateGroupBookingTotal } = await import("@/lib/bookings/recalculate-group-total");
  await tryRecalculateGroupBookingTotal(admin, args.groupBookingId);

  const currency = lead.currency || "ZAR";
  const { refundGroupGuestSharePayments } = await import("@/lib/bookings/group-guest-refunds");
  const guestOutcome = await refundGroupGuestSharePayments(admin, {
    bookingId: leadBookingId,
    participantId: args.participantId,
    currency,
    tenantId: lead.tenant_id ?? null,
    reason: `Guest left group booking ${lead.booking_number || leadBookingId}`,
  });

  if (newTotal == null) {
    await notifyRemoved();
    return {
      ok: true,
      mode: "booking_lines",
      leadBookingId,
      removedLines,
      guestRefunded: guestOutcome.refunded,
      walletCredited: 0,
      overpaidAmount: 0,
    };
  }

  const overpaidBefore = await computeLeadOverpaid(admin, leadBookingId, newTotal);
  // Guest money still awaiting a gateway retry is not the lead customer's to keep.
  const leadOverpaid = round2(Math.max(0, overpaidBefore - guestOutcome.failed));

  let walletCredited = 0;
  if (leadOverpaid > 0.009) {
    const { processBookingRefund } = await import("@/lib/bookings/refund-processing");
    const policy: CancellationPolicy = {
      id: "group_guest_removed",
      provider_id: "",
      location_type: null,
      hours_before_cutoff: 0,
      grace_window_minutes: 0,
      policy_text: "Group guest removed",
      late_cancellation_type: "full_refund",
      is_active: true,
      refund_percentage: 100,
      fee_amount: 0,
      fee_type: "fixed",
    };
    const credit = await processBookingRefund(leadBookingId, leadOverpaid, currency, policy, {
      isLateCancellation: false,
      maxWalletCredit: leadOverpaid,
    });
    if (credit.success) walletCredited = round2(Number(credit.amount ?? 0));
  }

  await notifyRemoved();
  return {
    ok: true,
    mode: "booking_lines",
    leadBookingId,
    removedLines,
    guestRefunded: guestOutcome.refunded,
    walletCredited,
    overpaidAmount: round2(Math.max(0, leadOverpaid - walletCredited)),
  };
}

async function computeLeadOverpaid(
  admin: SupabaseClient,
  leadBookingId: string,
  newTotal: number,
): Promise<number> {
  const { data: lead } = await admin
    .from("bookings")
    .select("total_paid, total_refunded")
    .eq("id", leadBookingId)
    .maybeSingle();
  const netPaid =
    Number((lead as { total_paid?: number | null } | null)?.total_paid ?? 0) -
    Number((lead as { total_refunded?: number | null } | null)?.total_refunded ?? 0);
  return round2(Math.max(0, netPaid - newTotal));
}
