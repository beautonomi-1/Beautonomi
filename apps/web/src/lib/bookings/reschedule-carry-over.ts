/**
 * Checkout reschedule: the original booking stays active until the replacement
 * booking is paid (or committed as cash). The original is then cancelled with a
 * full fee-free wallet refund, and the part of that credit the replacement
 * checkout applied is debited from the wallet onto the new booking. Anything
 * above the new amount due stays in the wallet. In-person cash and terminal
 * takings are not moved automatically.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMoney, percentOf, subtractMoney } from "@beautonomi/utils";
import { fetchBookingPaymentsForRefundCap } from "@/lib/bookings/booking-refund-limits";
import {
  isTerminalMachinePayment,
  sumNonTerminalInPersonCollected,
} from "@/lib/bookings/cancellation-cash-refund-obligation";
import {
  computeEffectiveCollectedAmount,
  settleBookingCancellation,
  type BookingFinancialSnapshot,
} from "@/lib/bookings/settle-booking-cancellation";
import { roundCurrency2 } from "@/lib/bookings/refund-processing";
import {
  buildSyntheticWalletGiftProviderId,
  completeWalletGiftSyntheticPayments,
  ensureWalletGiftBookingPayments,
} from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { fetchBookingCommissionContext } from "@/lib/bookings/fetch-booking-commission-context";
import { resolveCommissionBaseForBookingPayment } from "@/lib/bookings/resolve-commission-base-for-booking-payment";
import { storedPlatformFeeAmount } from "@/lib/bookings/provider-booking-platform-fee";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForBooking } from "@/lib/finance/resolve-commission-percentage-for-booking";
import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";

export const RESCHEDULE_CANCELLATION_REASON = "Rescheduled to new time";
export const RESCHEDULE_LEG_SUFFIX = ":reschedule";

export type RescheduleCarryOver =
  | {
      ok: true;
      /** Platform-held money (card, wallet, captured gift card) that becomes wallet credit. */
      credit: number;
      entitlementId: string | null;
    }
  | { ok: false; code: "GROUP_RESCHEDULE_USE_GROUP_ROUTE" | "RESCHEDULE_IN_PERSON_FUNDS" | "NOT_FOUND"; message: string };

const FULL_REFUND_POLICY: CancellationPolicy = {
  id: "reschedule_carry_over",
  provider_id: "",
  location_type: null,
  hours_before_cutoff: 0,
  grace_window_minutes: 0,
  policy_text: "Reschedule carry-over",
  late_cancellation_type: "full_refund",
  is_active: true,
  refund_percentage: 100,
  fee_amount: 0,
  fee_type: "fixed",
};

/**
 * A captured gift-card redemption cannot be voided, so settlement refunds it to
 * the wallet and it is part of the credit. A still-reserved redemption is
 * voided back onto the card instead.
 */
export function classifyRescheduleCarryOver(input: {
  groupBookingId?: string | null;
  collected: number;
  reservedGiftAmount: number;
  inPersonAmount: number;
  entitlementId?: string | null;
}): RescheduleCarryOver {
  if (input.groupBookingId) {
    return {
      ok: false,
      code: "GROUP_RESCHEDULE_USE_GROUP_ROUTE",
      message: "Group bookings are rescheduled from the group, not by starting a new checkout.",
    };
  }
  if (input.inPersonAmount > 0.009) {
    return {
      ok: false,
      code: "RESCHEDULE_IN_PERSON_FUNDS",
      message:
        "This booking was paid in person. Reschedule it from the booking page so the payment stays on the same appointment, or ask the provider to refund the in-person amount first.",
    };
  }
  const credit = roundCurrency2(
    Math.max(0, subtractMoney(input.collected, Math.max(0, input.reservedGiftAmount))),
  );
  return { ok: true, credit, entitlementId: input.entitlementId ?? null };
}

export const RESCHEDULE_IN_PROGRESS_MESSAGE =
  "This booking is being replaced by your reschedule. It is cancelled automatically once the new booking's payment completes.";

/**
 * A replacement checkout already counts this booking's payment as credit, so
 * only finalizeRescheduleCarryOver may cancel it until the replacement is
 * finalized or abandoned.
 */
export async function hasPendingRescheduleReplacement(
  admin: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("bookings")
    .select("id")
    .eq("rescheduled_from_booking_id", bookingId)
    .is("reschedule_carry_over_finalized_at", null)
    .not("status", "in", "(cancelled,no_show)")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function loadRescheduleCarryOver(
  admin: SupabaseClient,
  bookingId: string,
  customerId: string,
): Promise<RescheduleCarryOver> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, customer_id, group_booking_id, total_paid, total_refunded, wallet_amount, gift_card_amount, customer_package_entitlement_id, tenant_id, status",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, code: "NOT_FOUND", message: "The booking you are rescheduling could not be found." };
  }
  const row = data as {
    customer_id?: string;
    group_booking_id?: string | null;
    total_paid?: number | null;
    total_refunded?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
    customer_package_entitlement_id?: string | null;
    tenant_id?: string | null;
    status?: string;
  };
  if (row.customer_id !== customerId) {
    return { ok: false, code: "NOT_FOUND", message: "You can only reschedule your own bookings." };
  }
  if (row.status === "cancelled" || row.status === "completed" || row.status === "no_show") {
    return { ok: false, code: "NOT_FOUND", message: "This booking can no longer be rescheduled." };
  }
  const payments = await fetchBookingPaymentsForRefundCap(admin, bookingId, row.tenant_id ?? null);
  const inPerson = addMoney(
    sumNonTerminalInPersonCollected(payments),
    payments
      .filter((p) => isTerminalMachinePayment(p) && (p.status === "completed" || p.status === "partially_refunded"))
      .reduce((s, p) => addMoney(s, Math.max(0, Number(p.amount ?? 0))), 0),
  );
  const { data: reservedRows } = await admin
    .from("gift_card_redemptions")
    .select("amount")
    .eq("booking_id", bookingId)
    .eq("status", "reserved");
  const reservedGiftAmount = roundCurrency2(
    ((reservedRows ?? []) as Array<{ amount?: number | string | null }>).reduce(
      (s, r) => addMoney(s, Math.max(0, Number(r.amount ?? 0))),
      0,
    ),
  );
  const collected = computeEffectiveCollectedAmount({
    id: bookingId,
    provider_id: "",
    total_paid: row.total_paid,
    total_refunded: row.total_refunded,
    wallet_amount: row.wallet_amount,
    gift_card_amount: row.gift_card_amount,
    total_amount: 0,
  });
  return classifyRescheduleCarryOver({
    groupBookingId: row.group_booking_id,
    collected,
    reservedGiftAmount,
    inPersonAmount: inPerson,
    entitlementId: row.customer_package_entitlement_id,
  });
}

/** Give the session back to the original booking after a failed replacement checkout. */
export async function returnBorrowedPackageSession(
  admin: SupabaseClient,
  entitlementId: string,
  customerId: string,
): Promise<void> {
  await (admin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>)(
    "redeem_customer_package_entitlement",
    { p_entitlement_id: entitlementId, p_customer_id: customerId },
  );
}

export async function borrowPackageSessionForReschedule(
  admin: SupabaseClient,
  entitlementId: string,
  customerId: string,
): Promise<boolean> {
  const { data, error } = await (admin.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "restore_customer_package_entitlement",
    { p_entitlement_id: entitlementId, p_customer_id: customerId },
  );
  if (error) {
    console.error("[reschedule] borrow package session failed", error.message);
    return false;
  }
  return data !== false;
}

async function sumCompletedCancellationCredits(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("booking_refunds")
    .select("amount, reason")
    .eq("booking_id", bookingId)
    .eq("refund_method", "store_credit")
    .eq("status", "completed");
  if (error) return null;
  return roundCurrency2(
    ((data ?? []) as Array<{ amount?: number | string | null; reason?: string | null }>)
      .filter((r) => String(r.reason ?? "").startsWith("Cancellation refund"))
      .reduce((s, r) => addMoney(s, Math.max(0, Number(r.amount ?? 0))), 0),
  );
}

/**
 * The online-charge ledger only counts tender in the charge metadata, and the
 * wallet-leg trigger skips bookings that already have a `payment` row. Post the
 * reschedule credit leg here in that case, using residual allocation so a
 * booking whose ledger already covers its total posts nothing more. Without a
 * `payment` row the trigger posts the leg when it completes.
 */
async function postRescheduleCreditLedger(
  admin: SupabaseClient,
  bookingId: string,
  legId: string,
  amount: number,
): Promise<{ ok: boolean }> {
  const { data: existing, error: existingErr } = await admin
    .from("finance_transactions")
    .select("id, transaction_type, source_payment_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "payment");
  if (existingErr) return { ok: false };
  const rows = (existing ?? []) as Array<{ source_payment_id?: string | null }>;
  if (rows.length === 0) return { ok: true };
  if (rows.some((r) => String(r.source_payment_id ?? "") === legId)) return { ok: true };

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, booking_number, provider_id, tenant_id, currency, total_amount, tip_amount, tax_amount, travel_fee, platform_fee_amount, service_fee_amount, platform_service_fee",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { ok: false };
  const b = booking as {
    booking_number?: string | null;
    provider_id?: string | null;
    tenant_id?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    tip_amount?: number | null;
    tax_amount?: number | null;
    travel_fee?: number | null;
    platform_fee_amount?: number | null;
    service_fee_amount?: number | null;
    platform_service_fee?: number | null;
  };

  const financeTenantId = await resolveTenantIdForFinanceLedger(admin, {
    tenant_id: b.tenant_id ?? null,
    provider_id: b.provider_id ?? null,
  });
  const context = await fetchBookingCommissionContext(admin, bookingId, {
    chargeAmount: amount,
    excludePaymentId: legId,
  });
  const base = resolveCommissionBaseForBookingPayment({
    paymentAmount: amount,
    bookingTotal: Number(b.total_amount ?? 0),
    platformFee: storedPlatformFeeAmount({
      platform_fee_amount: b.platform_fee_amount,
      service_fee_amount: b.service_fee_amount ?? b.platform_service_fee,
    }),
    tip: Number(b.tip_amount ?? 0),
    tax: Number(b.tax_amount ?? 0),
    travel: Number(b.travel_fee ?? 0),
    postedLegsSum: context.postedLegsSum,
    cumulativePaid: context.cumulativePaid,
    bookingLevelItemsAlreadyPosted: context.bookingLevelItemsAlreadyPosted,
  });
  if (base <= 0.009) return { ok: true };

  const rate = await resolveCommissionPercentageForBooking(admin, {
    bookingId,
    tenantId: financeTenantId,
    providerId: b.provider_id ?? null,
  });
  const commission = rate > 0 ? percentOf(base, rate) : 0;
  const earnings = subtractMoney(base, commission);
  const bookingNumber = b.booking_number ?? bookingId;
  const now = new Date().toISOString();
  const shared = {
    booking_id: bookingId,
    provider_id: b.provider_id ?? null,
    tenant_id: financeTenantId,
    source_payment_id: legId,
    currency: b.currency?.trim() || "ZAR",
    created_at: now,
  };
  const { error } = await admin.from("finance_transactions").insert([
    {
      ...shared,
      transaction_type: "payment",
      amount: base,
      fees: 0,
      commission,
      net: commission,
      description: `Payment for booking ${bookingNumber} (reschedule credit)`,
      metadata: { reference: buildSyntheticWalletGiftProviderId("wallet", bookingId, RESCHEDULE_LEG_SUFFIX) },
    },
    {
      ...shared,
      transaction_type: "provider_earnings",
      amount: earnings,
      fees: 0,
      commission: 0,
      net: earnings,
      description: `Provider earnings for booking ${bookingNumber} (reschedule credit)`,
    },
  ]);
  if (error && (error as { code?: string }).code !== "23505") {
    console.error("[finalizeRescheduleCarryOver] ledger insert failed", error);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * After the replacement booking is paid (or committed as cash): cancel the
 * original with a full fee-free wallet refund, then move the applied part of
 * that credit onto the new booking. Idempotent via reschedule_carry_over_finalized_at;
 * the settle-pending-cancellations cron retries unfinished runs.
 */
export async function finalizeRescheduleCarryOver(
  admin: SupabaseClient,
  newBookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: fresh, error } = await admin
    .from("bookings")
    .select(
      "id, customer_id, provider_id, tenant_id, currency, booking_number, status, rescheduled_from_booking_id, reschedule_credit_pending, reschedule_carry_over_finalized_at, wallet_amount, customer_package_entitlement_id",
    )
    .eq("id", newBookingId)
    .maybeSingle();
  if (error || !fresh) return { ok: false, reason: "not_found" };
  const row = fresh as {
    id: string;
    customer_id: string;
    provider_id: string;
    tenant_id?: string | null;
    currency?: string | null;
    booking_number?: string | null;
    status?: string | null;
    rescheduled_from_booking_id?: string | null;
    reschedule_credit_pending?: number | null;
    reschedule_carry_over_finalized_at?: string | null;
    wallet_amount?: number | null;
    customer_package_entitlement_id?: string | null;
  };
  if (!row.rescheduled_from_booking_id) return { ok: true, reason: "not_a_reschedule" };
  if (row.reschedule_carry_over_finalized_at) return { ok: true, reason: "already_finalized" };
  if (row.status === "cancelled") return { ok: false, reason: "replacement_cancelled" };

  const oldId = row.rescheduled_from_booking_id;
  const nowIso = new Date().toISOString();
  const { data: claimed } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancelled_by: row.customer_id,
      cancellation_reason: RESCHEDULE_CANCELLATION_REASON,
      updated_at: nowIso,
    })
    .eq("id", oldId)
    .not("status", "in", "(completed,cancelled,no_show)")
    .select("id, provider_id, customer_id, booking_number, tenant_id, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned, customer_package_entitlement_id, promotion_id")
    .maybeSingle();

  const old = claimed as (BookingFinancialSnapshot & {
    customer_package_entitlement_id?: string | null;
    promotion_id?: string | null;
    currency?: string | null;
  }) | null;

  if (!old) {
    const { data: existing } = await admin
      .from("bookings")
      .select("cancellation_reason")
      .eq("id", oldId)
      .maybeSingle();
    const reason = (existing as { cancellation_reason?: string } | null)?.cancellation_reason;
    if (reason !== RESCHEDULE_CANCELLATION_REASON) {
      return { ok: false, reason: "old_booking_not_claimable" };
    }
  } else {
    const currency = old.currency || row.currency || "ZAR";
    try {
      await settleBookingCancellation({
        booking: old,
        cancelledBy: "customer",
        currency,
        policy: { ...FULL_REFUND_POLICY, provider_id: old.provider_id },
        isLateCancellation: false,
        explicitCancellationFee: 0,
        refundBookingTotal: Number(old.total_amount ?? 0),
      });
    } catch (settleErr) {
      console.error("[finalizeRescheduleCarryOver] settle failed", oldId, settleErr);
      await admin
        .from("bookings")
        .update({
          cancellation_settlement_error:
            settleErr instanceof Error ? settleErr.message.slice(0, 500) : "reschedule_settle_failed",
        })
        .eq("id", oldId);
    }

    if (old.customer_package_entitlement_id) {
      // The checkout borrowed this session when the new booking reuses it.
      // Otherwise the cancelled booking gives its session back.
      if (row.customer_package_entitlement_id !== old.customer_package_entitlement_id) {
        await (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: unknown }>)(
          "restore_customer_package_entitlement",
          { p_entitlement_id: old.customer_package_entitlement_id, p_customer_id: row.customer_id },
        );
      }
      await admin
        .from("bookings")
        .update({ customer_package_entitlement_id: null })
        .eq("id", oldId);
    }

    if (old.promotion_id) {
      const { data: removed } = await admin
        .from("promotion_usage")
        .delete()
        .eq("booking_id", oldId)
        .eq("promotion_id", old.promotion_id)
        .select("id");
      if (Array.isArray(removed) && removed.length > 0) {
        const { data: promo } = await admin
          .from("promotions")
          .select("usage_count")
          .eq("id", old.promotion_id)
          .maybeSingle();
        const next = Math.max(0, Number((promo as { usage_count?: number } | null)?.usage_count ?? 1) - 1);
        await admin.from("promotions").update({ usage_count: next }).eq("id", old.promotion_id);
      }
    }

    try {
      const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
      await matchWaitlistOnCancellation(admin, oldId);
    } catch (waitlistErr) {
      console.error("[finalizeRescheduleCarryOver] waitlist matching failed", oldId, waitlistErr);
    }

    await admin.from("booking_events").insert({
      booking_id: oldId,
      event_type: "rescheduled",
      event_data: { rescheduled_to: row.id },
      created_by: row.customer_id,
    });
  }

  const { data: oldState } = await admin
    .from("bookings")
    .select("cancellation_settled_at")
    .eq("id", oldId)
    .maybeSingle();
  if (!(oldState as { cancellation_settled_at?: string | null } | null)?.cancellation_settled_at) {
    return { ok: false, reason: "old_refund_pending" };
  }

  const pending = roundCurrency2(Math.max(0, Number(row.reschedule_credit_pending ?? 0)));
  let applied = 0;
  if (pending > 0.009 && row.customer_id) {
    const credited = await sumCompletedCancellationCredits(admin, oldId);
    if (credited === null) return { ok: false, reason: "credit_lookup_failed" };
    applied = roundCurrency2(Math.min(pending, credited));
  }

  if (applied > 0.009) {
    const legProviderId = buildSyntheticWalletGiftProviderId("wallet", row.id, RESCHEDULE_LEG_SUFFIX);
    const { data: legBefore } = await admin
      .from("booking_payments")
      .select("id")
      .eq("booking_id", row.id)
      .eq("payment_provider_id", legProviderId)
      .maybeSingle();

    if (!legBefore) {
      const tenantId = await resolveTenantIdForFinanceLedger(admin, {
        tenant_id: row.tenant_id,
        provider_id: row.provider_id,
      });
      const { error: debitErr } = await (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
        "wallet_debit_admin",
        {
          p_user_id: row.customer_id,
          p_amount: applied,
          p_currency: row.currency || "ZAR",
          p_description: `Reschedule credit applied to booking ${row.booking_number || row.id}`,
          p_reference_id: row.id,
          p_reference_type: "booking",
          p_tenant_id: tenantId,
          p_idempotency_key: `reschedule_carry_over:${row.id}`,
        },
      );
      if (debitErr) {
        console.error("[finalizeRescheduleCarryOver] wallet debit failed", debitErr.message);
        return { ok: false, reason: "wallet_debit_failed" };
      }
      await ensureWalletGiftBookingPayments(admin, {
        bookingId: row.id,
        tenantId: row.tenant_id,
        walletAmount: applied,
        giftCardAmount: 0,
        initialStatus: "pending",
        paymentLegSuffix: RESCHEDULE_LEG_SUFFIX,
      });
      await admin
        .from("bookings")
        .update({ wallet_amount: addMoney(Number(row.wallet_amount ?? 0), applied) })
        .eq("id", row.id);
    }

    const { data: leg } = await admin
      .from("booking_payments")
      .select("id, status")
      .eq("booking_id", row.id)
      .eq("payment_provider_id", legProviderId)
      .maybeSingle();
    const legRow = leg as { id?: string; status?: string } | null;
    if (!legRow?.id) return { ok: false, reason: "credit_leg_missing" };
    if (legRow.status !== "completed") {
      const ledger = await postRescheduleCreditLedger(admin, row.id, legRow.id, applied);
      if (!ledger.ok) return { ok: false, reason: "ledger_failed" };
      await completeWalletGiftSyntheticPayments(admin, row.id, {
        paymentLegSuffix: RESCHEDULE_LEG_SUFFIX,
      });
    }
  }

  await admin
    .from("bookings")
    .update({
      reschedule_credit_pending: applied,
      reschedule_carry_over_finalized_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return { ok: true };
}
