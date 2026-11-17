import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseBookingSlotAfterPaymentFailure } from "@/app/api/public/bookings/_helpers/release-booking-slot-after-payment-failure";
import { returnBorrowedSessionIfReleased } from "@/lib/bookings/reschedule-carry-over";
import { verifyAndSettleOnlinePayment } from "@/lib/payments/resolve-online-verify";

export type OwnOpenCheckoutOutcome =
  | { bookingId: string; action: "settled" }
  | { bookingId: string; action: "in_progress" }
  | { bookingId: string; action: "released" }
  | { bookingId: string; action: "skipped" };

function gatewayLooksProcessing(
  provider: string | null,
  raw: unknown,
): boolean {
  if (!raw || typeof raw !== "object") return false;
  const body = raw as Record<string, unknown>;
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  const status = String(data.status ?? data.payment_status ?? "")
    .trim()
    .toLowerCase();

  if (provider === "stripe") {
    return status === "open" || status === "unpaid" || status === "processing";
  }
  if (provider === "flutterwave") {
    return status === "pending" || status === "processing";
  }
  // Paystack and unknown
  return (
    status === "ongoing" ||
    status === "processing" ||
    status === "pending" ||
    status === "queued"
  );
}

type OpenCheckoutBookingRow = {
  id: string;
  customer_id?: string | null;
  customer_package_entitlement_id?: string | null;
  rescheduled_from_booking_id?: string | null;
  payment_reference?: string | null;
  payment_provider?: string | null;
  tenant_id?: string | null;
};

/**
 * Ask the gateway about one unpaid booking, then settle, wait, or release.
 */
export async function settleOrReleasePendingCheckout(
  admin: SupabaseClient,
  stale: OpenCheckoutBookingRow,
  customerId: string,
  borrowedEntitlementId?: string | null,
): Promise<OwnOpenCheckoutOutcome> {
  const reference = String(stale.payment_reference ?? "").trim();
  if (reference) {
    try {
      const probed = await verifyAndSettleOnlinePayment(
        {
          reference,
          tenantId: stale.tenant_id ?? null,
        },
        admin,
      );
      if (probed.paid) {
        if (probed.provider === "paystack" && probed.paystackVerifyJson) {
          const { processSuccessfulPayment } = await import(
            "@/app/api/payments/webhook/_handlers/charge-success"
          );
          const verifyJson = probed.paystackVerifyJson as {
            data?: Record<string, unknown>;
          };
          const chargeData = (verifyJson?.data ?? verifyJson) as Parameters<
            typeof processSuccessfulPayment
          >[0];
          if (chargeData && typeof chargeData === "object") {
            await processSuccessfulPayment(chargeData as never, admin);
          }
        }
        return { bookingId: stale.id, action: "settled" };
      }
      if (gatewayLooksProcessing(probed.provider, probed.paystackVerifyJson)) {
        return { bookingId: stale.id, action: "in_progress" };
      }
    } catch (probeErr) {
      console.warn(
        "[settleOrReleasePendingCheckout] gateway probe failed; releasing",
        stale.id,
        probeErr,
      );
    }
  }

  let released = false;
  try {
    await releaseBookingSlotAfterPaymentFailure(admin, stale.id, customerId);
    released = true;
  } catch (releaseErr) {
    console.error(
      "[settleOrReleasePendingCheckout] failed to release stale booking",
      stale.id,
      releaseErr,
    );
  }
  try {
    await returnBorrowedSessionIfReleased(
      admin,
      {
        id: stale.id,
        customer_id: stale.customer_id ?? customerId,
        customer_package_entitlement_id: stale.customer_package_entitlement_id,
        rescheduled_from_booking_id: stale.rescheduled_from_booking_id,
      },
      borrowedEntitlementId,
    );
  } catch (sessionErr) {
    console.error(
      "[settleOrReleasePendingCheckout] failed to keep the borrowed package session",
      stale.id,
      sessionErr,
    );
  }
  if (!released) return { bookingId: stale.id, action: "skipped" };
  return { bookingId: stale.id, action: "released" };
}

/**
 * Gateway-checked cleanup of the caller's own unpaid online checkouts so a
 * retry (new hold or new booking) is not blocked by their abandoned visit.
 */
export async function releaseOwnOpenCheckouts(
  admin: SupabaseClient,
  params: {
    customerId: string;
    providerId: string;
    windowStart: string;
    windowEnd: string;
    excludeBookingId?: string | null;
    borrowedEntitlementId?: string | null;
  },
): Promise<{
  outcomes: OwnOpenCheckoutOutcome[];
  paymentInProgressBookingId: string | null;
}> {
  let query = admin
    .from("bookings")
    .select(
      "id, customer_id, customer_package_entitlement_id, rescheduled_from_booking_id, payment_reference, payment_provider, tenant_id",
    )
    .eq("customer_id", params.customerId)
    .eq("provider_id", params.providerId)
    .eq("booking_source", "online")
    .eq("payment_status", "pending")
    .in("status", ["pending", "pending_payment", "confirmed"])
    .gte("scheduled_at", params.windowStart)
    .lte("scheduled_at", params.windowEnd);

  if (params.excludeBookingId) {
    query = query.neq("id", params.excludeBookingId);
  }

  const { data: rows } = await query;
  const staleRows = (rows as OpenCheckoutBookingRow[] | null) ?? [];

  const outcomes: OwnOpenCheckoutOutcome[] = [];
  let paymentInProgressBookingId: string | null = null;

  for (const stale of staleRows) {
    const outcome = await settleOrReleasePendingCheckout(
      admin,
      stale,
      params.customerId,
      params.borrowedEntitlementId,
    );
    outcomes.push(outcome);
    if (outcome.action === "in_progress" && !paymentInProgressBookingId) {
      paymentInProgressBookingId = outcome.bookingId;
    }
  }

  return { outcomes, paymentInProgressBookingId };
}
