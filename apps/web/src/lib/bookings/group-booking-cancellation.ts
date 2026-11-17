/**
 * Group Booking Cancellation
 * Handle cancellation of group bookings (all participants or individual)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getBookingsAdminClient } from '@/lib/bookings/bookings-admin-write';
import { getGroupBooking } from './group-booking';
import type { CancellationPolicy } from './cancellation-policy';
import { loadCancellationOutcomeForBooking } from './load-cancellation-outcome';
import type { CancelActor } from './resolve-cancellation-outcome';
import {
  settleParamsFromCancellationOutcome,
} from './cancellation-outcome-bridge';
import type { CancellationSettledBy } from './settle-booking-cancellation';
import {
  settleBookingCancellation,
  settleBookingFinanceById,
} from './settle-booking-cancellation';
import {
  lineUpBookingStockWithSavedStatus,
  restoreBookingRetailStock,
} from '@/lib/bookings/deduct-booking-retail-stock';
import { returnPackageSessionAfterCancel } from '@/lib/bookings/return-package-session-after-cancel';

function financeActorToCancelActor(actor: CancellationSettledBy): CancelActor {
  if (actor === 'portal') return 'portal';
  if (actor === 'provider') return 'provider';
  if (actor === 'admin') return 'admin';
  if (actor === 'no_show') return 'no_show';
  return 'customer';
}

export interface GroupCancelFinanceContext {
  policy: CancellationPolicy | null;
  isLateCancellation?: boolean;
}

export type GroupBookingChildSettlement = {
  bookingId: string;
  walletRefund: number;
  inPersonRefundDue: number;
  currency: string;
  /** Settlement threw or returned no result, so no wallet credit was confirmed. */
  settlementFailed: boolean;
  /** Wallet credit finished. False when it was still owed and the credit did not succeed. */
  refundSucceeded: boolean;
  giftCardRestored: boolean;
  giftValueStillDue: boolean;
  guestShareRefundFailed: boolean;
};

function childSettlementFromResult(
  bookingId: string,
  currency: string,
  fallbackInPerson: number,
  settleResult:
    | {
        walletRefundAmount?: number;
        refundResult?: { success?: boolean };
        giftCardVoidAttempted?: boolean;
        giftValueStillDue?: boolean;
        inPersonCashRefundDue?: number | null;
        guestShareRefundFailed?: boolean;
      }
    | null
    | undefined,
  settlementFailed: boolean,
): GroupBookingChildSettlement {
  if (settlementFailed || !settleResult) {
    return {
      bookingId,
      walletRefund: 0,
      inPersonRefundDue: fallbackInPerson,
      currency,
      settlementFailed,
      refundSucceeded: !settlementFailed,
      giftCardRestored: false,
      giftValueStillDue: false,
      guestShareRefundFailed: false,
    };
  }
  const reported = settleResult.refundResult;
  return {
    bookingId,
    walletRefund: Number(settleResult.walletRefundAmount ?? 0),
    inPersonRefundDue:
      settleResult.inPersonCashRefundDue != null
        ? Number(settleResult.inPersonCashRefundDue)
        : fallbackInPerson,
    currency,
    settlementFailed: false,
    refundSucceeded: reported ? reported.success === true : true,
    giftCardRestored: settleResult.giftCardVoidAttempted === true,
    giftValueStillDue: settleResult.giftValueStillDue === true,
    guestShareRefundFailed: settleResult.guestShareRefundFailed === true,
  };
}

const TERMINAL_CHILD_STATUSES = new Set(["completed", "cancelled", "no_show"]);

/**
 * Cancel entire group booking (all participants)
 */
export async function cancelGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string,
  cancelledBy: string,
  reason?: string,
  options?: {
    settleFinance?: boolean;
    financeActor?: CancellationSettledBy;
    financeContext?: GroupCancelFinanceContext;
    /**
     * Bookings the caller already set to `cancelled` (customer cancel of the primary) that still
     * need finance settlement here. Without this they are skipped as terminal.
     */
    settleAlreadyCancelledBookingIds?: string[];
    /**
     * When false, the caller matches the waitlist after the HTTP response.
     * Default true so admin and customer cancels still free the slot here.
     */
    matchWaitlist?: boolean;
  },
): Promise<GroupBookingChildSettlement[]> {
  const groupBooking = await getGroupBooking(supabase, groupBookingId);
  if (!groupBooking) {
    throw new Error('Group booking not found');
  }

  const bookingsById = new Map<string, Record<string, unknown>>();
  for (const booking of groupBooking.bookings) {
    const id = String((booking as { id?: string }).id ?? "");
    if (id) bookingsById.set(id, booking as Record<string, unknown>);
  }
  const { data: linkedByGroup } = await supabase
    .from("bookings")
    .select("id, status, currency, total_amount")
    .eq("group_booking_id", groupBookingId);
  for (const row of linkedByGroup ?? []) {
    const id = String((row as { id?: string }).id ?? "");
    if (id && !bookingsById.has(id)) {
      bookingsById.set(id, row as Record<string, unknown>);
    }
  }

  const childSettlements: GroupBookingChildSettlement[] = [];
  const cancelledBookingIds: string[] = [];
  const financeActor = options?.financeActor ?? "customer";
  const cancelActor = financeActorToCancelActor(financeActor);
  const preCancelledIds = new Set(options?.settleAlreadyCancelledBookingIds ?? []);

  for (const booking of bookingsById.values()) {
    const bookingId = String(booking.id ?? "");
    if (!bookingId) continue;
    const preCancelled = preCancelledIds.has(bookingId);
    if (!preCancelled && TERMINAL_CHILD_STATUSES.has(String(booking.status ?? ""))) {
      continue;
    }
    let cancellationFee = 0;
    let loadedOutcome: Awaited<ReturnType<typeof loadCancellationOutcomeForBooking>>["outcome"] =
      null;
    if (options?.settleFinance) {
      const loaded = await loadCancellationOutcomeForBooking(
        supabase,
        bookingId,
        cancelActor,
        {
          explicitCancellationFee: undefined,
        },
      );
      loadedOutcome = loaded.outcome;
      if (loaded.outcome) {
        cancellationFee =
          (loaded.outcome as { leadFeeRetained?: number }).leadFeeRetained ??
          loaded.outcome.feeRetained;
      }
    }

    const bookingsAdmin = getBookingsAdminClient();
    let claimedForSettlement = preCancelled;
    if (!preCancelled) {
      const stockReturned = await restoreBookingRetailStock(bookingsAdmin, bookingId);
      const { data: claimed, error } = await bookingsAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: cancelledBy,
          cancellation_reason: reason || 'Group booking cancelled',
          cancellation_fee: cancellationFee,
        })
        .eq('id', bookingId)
        .not('status', 'in', '(completed,cancelled,no_show)')
        .select('id');
      if (error || !Array.isArray(claimed) || claimed.length === 0) {
        await lineUpBookingStockWithSavedStatus(bookingsAdmin, bookingId, [], stockReturned);
      }
      if (error) {
        throw new Error(
          `Failed to cancel group booking child ${bookingId}: ${error.message}`,
        );
      }
      // Zero rows: a concurrent cancel already claimed this child and owns its settlement.
      claimedForSettlement = Array.isArray(claimed) && claimed.length > 0;
      if (claimedForSettlement) {
        await returnPackageSessionAfterCancel(bookingsAdmin, bookingId);
      }
    }
    if (claimedForSettlement) {
      cancelledBookingIds.push(bookingId);
      // Cash / terminal / bank transfer money is never wallet-credited; the provider refunds it.
      const inPersonRefundDue = loadedOutcome?.inPersonRefundDue ?? 0;
      const currency = String(booking.currency ?? "ZAR");
      let childSettlement = childSettlementFromResult(
        bookingId,
        currency,
        inPersonRefundDue,
        null,
        options?.settleFinance === true,
      );
      if (options?.settleFinance) {
        try {
          if (loadedOutcome) {
            const { data: finRow } = await bookingsAdmin
              .from("bookings")
              .select(
                "id, provider_id, customer_id, booking_number, tenant_id, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned",
              )
              .eq("id", bookingId)
              .maybeSingle();
            if (finRow) {
              const grossTotal = Number(finRow.total_amount ?? 0);
              const rowCurrency = (finRow.currency as string) || currency;
              const settleResult = await settleBookingCancellation(
                settleParamsFromCancellationOutcome(loadedOutcome, cancelActor, {
                  booking: { ...finRow, total_amount: grossTotal },
                  currency: rowCurrency,
                  refundBookingTotal: grossTotal,
                }),
              );
              childSettlement = childSettlementFromResult(
                bookingId,
                rowCurrency,
                inPersonRefundDue,
                settleResult,
                false,
              );
              await bookingsAdmin
                .from("bookings")
                .update({ cancellation_fee: settleResult.cancellationFeeApplied })
                .eq("id", bookingId);
            }
          } else {
            const settleResult = await settleBookingFinanceById(bookingsAdmin, bookingId, financeActor, {
              policy: options.financeContext?.policy,
              isLateCancellation: options.financeContext?.isLateCancellation,
            });
            childSettlement = childSettlementFromResult(
              bookingId,
              currency,
              inPersonRefundDue,
              settleResult,
              !settleResult,
            );
          }
        } catch (settleErr) {
          console.error("[group cancel] finance settlement failed for", bookingId, settleErr);
          childSettlement = childSettlementFromResult(
            bookingId,
            currency,
            inPersonRefundDue,
            null,
            true,
          );
        }
      }
      childSettlements.push(childSettlement);
    }
  }

  // Notify waitlist for freed slots. Provider group delete defers this until after the response.
  if (options?.matchWaitlist !== false) {
    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await Promise.allSettled(
        cancelledBookingIds.map((bid) => matchWaitlistOnCancellation(supabase, bid))
      );
    } catch (waitlistErr) {
      console.error("[group cancel] waitlist matching failed:", waitlistErr);
    }
  }

  const { error: groupUpdateError } = await supabase
    .from('group_bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', groupBookingId);

  if (groupUpdateError) {
    throw new Error(
      `Failed to cancel group booking ${groupBookingId}: ${groupUpdateError.message}`,
    );
  }

  return childSettlements;
}

/**
 * Cancel an individual participant from a group booking.
 *
 * If the participant is the primary contact the entire group is cancelled
 * (same as cancelling the lead booking).
 *
 * For non-primary participants the linked child booking is cancelled (not
 * deleted — audit trail must be preserved) and unlinked from the group.
 * The booking_participants row stays for history; it is not deleted.
 *
 * Callers should go through `cancelGroupGuest`, which also handles guests stored as
 * tagged lines on the lead booking (no child booking).
 */
export async function cancelGroupBookingParticipant(
  supabase: SupabaseClient,
  bookingId: string,
  participantId: string,
  cancelledBy: string,
  reason?: string,
  options?: {
    /** Customer cancel route already marked the booking cancelled and will settle finance. */
    bookingAlreadyCancelled?: boolean;
  },
): Promise<void> {
  const { data: participant } = await supabase
    .from('booking_participants')
    .select('id, booking_id, group_booking_id, is_primary_contact')
    .eq('id', participantId)
    .maybeSingle();

  if (!participant) {
    throw new Error('Participant not found');
  }

  const groupBookingId = participant.group_booking_id as string | null;

  if (participant.is_primary_contact && groupBookingId) {
    await cancelGroupBooking(supabase, groupBookingId, cancelledBy, reason, {
      settleFinance: true,
      financeActor: "provider",
    });
    return;
  }

  const linkedBookingId = (participant.booking_id ?? bookingId) as string | null;

  if (linkedBookingId) {
    const now = new Date().toISOString();
    const bookingsAdmin = getBookingsAdminClient();
    let visitCancelled = Boolean(options?.bookingAlreadyCancelled);
    if (options?.bookingAlreadyCancelled) {
      await bookingsAdmin
        .from('bookings')
        .update({
          group_booking_id: null,
          updated_at: now,
        })
        .eq('id', linkedBookingId);
    } else {
      const stockReturned = await restoreBookingRetailStock(bookingsAdmin, linkedBookingId);
      const { data: removed, error: removeError } = await bookingsAdmin
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          cancelled_by: cancelledBy,
          cancellation_reason: reason || 'Removed from group booking',
          group_booking_id: null,
          updated_at: now,
        })
        .eq('id', linkedBookingId)
        .not('status', 'in', '(completed,no_show,cancelled)')
        .select('id');
      if (removeError || !Array.isArray(removed) || removed.length === 0) {
        await lineUpBookingStockWithSavedStatus(bookingsAdmin, linkedBookingId, [], stockReturned);
      } else {
        visitCancelled = true;
        await returnPackageSessionAfterCancel(bookingsAdmin, linkedBookingId);
        try {
          const { settleBookingFinanceById } = await import("./settle-booking-cancellation");
          await settleBookingFinanceById(bookingsAdmin, linkedBookingId, "provider");
        } catch (settleErr) {
          console.error("[group participant cancel] finance settlement failed:", settleErr);
        }
      }
    }

    if (visitCancelled) {
      try {
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await matchWaitlistOnCancellation(supabase, linkedBookingId);
      } catch (waitlistErr) {
        console.error("[group participant cancel] waitlist matching failed:", waitlistErr);
      }
    }
  }
}

/**
 * Get group booking participants for cancellation notifications
 */
export async function getGroupBookingParticipantsForCancellation(
  supabase: SupabaseClient,
  groupBookingId: string
): Promise<Array<{
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  booking_id: string | null;
  is_primary_contact: boolean;
}>> {
  const groupBooking = await getGroupBooking(supabase, groupBookingId);
  if (!groupBooking) {
    return [];
  }

  return groupBooking.participants.map(p => ({
    participant_name: p.participant_name,
    participant_email: p.participant_email,
    participant_phone: p.participant_phone,
    booking_id: p.booking_id ?? null,
    is_primary_contact: p.is_primary_contact === true,
  }));
}
