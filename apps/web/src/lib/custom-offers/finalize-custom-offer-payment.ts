/**
 * Finalize a custom-offer payment.
 *
 * Single source of truth for "customer paid for a custom offer → create the booking
 * and all bookkeeping rows". Called from:
 *   - Paystack `charge.success` webhook
 *   - Paystack `transaction/verify` short-circuit
 *   - The zero-Paystack path in `POST /api/me/custom-offers/:id/pay` when the
 *     offer is fully covered by wallet + gift card (+ loyalty discount)
 *
 * Idempotent on `(offer_id, payment_reference)`. Tolerates split tenders:
 *   amount_paid = paystackAmount + walletAmount + giftCardAmount
 *   total_amount = amount_paid + loyaltyDiscountAmount  (loyalty is a discount, not a tender)
 *
 * Caller MUST pass an admin-scoped Supabase client (service_role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { percentOf, subtractMoney } from "@beautonomi/utils";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { ensureWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { recordLoyaltyRedemption } from "@/lib/loyalty/record-redemption";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";

export interface FinalizeCustomOfferPaymentInput {
  offerId: string;
  /** Stable, unique reference for idempotency (paystack ref OR `co_split_<offerId>` for zero-paystack). */
  reference: string;
  /**
   * Amount Paystack actually charged (in major units of the offer currency).
   * Pass 0 when the entire collectable was covered by wallet + gift card.
   */
  paystackAmountMajor: number;
  /** Paystack gateway fees (major units). 0 for non-Paystack settlements. */
  paystackFeesMajor: number;
  /** Wallet contribution applied to this offer (major units, already debited if > 0). */
  walletAmountApplied: number;
  /** Gift-card contribution applied to this offer (major units, already reserved if > 0). */
  giftCardAmountApplied: number;
  /** Gift card row id (populated when the offer pay route validated balance upfront). */
  giftCardId?: string | null;
  /** Gift card code (uppercase). When set, finalize calls `reserve_gift_card_redemption`. */
  giftCardCode?: string | null;
  /** Loyalty points the customer asked to redeem (already validated upstream). */
  loyaltyPointsRedeemed?: number;
  /** Loyalty discount amount (major units). */
  loyaltyDiscountAmount?: number;
  /**
   * Pricing breakdown — passed via Paystack metadata or computed in the pay endpoint.
   * Mirrors the keys we already write to `bookings`.
   */
  pricingMetadata?: Record<string, unknown>;
  customerEmail?: string | null;
  /** "paystack" | "wallet" | "gift_card" | "split". Used for booking row & receipts. */
  paymentProvider?: "paystack" | "wallet" | "gift_card" | "split";
}

export interface FinalizeCustomOfferPaymentResult {
  ok: boolean;
  /** Booking id when finalize succeeded (idempotent path returns the existing one). */
  bookingId?: string;
  /** Reason when ok=false; e.g. "withdrawn" / "expired" / "insert_failed". */
  reason?: string;
}

type OfferRow = {
  id?: string;
  status?: string;
  booking_id?: string;
  duration_minutes?: number;
  price?: number;
  currency?: string;
  scheduled_at?: string;
  location_id?: string | null;
  staff_id?: string | null;
  travel_fee?: number;
  request?: CustomRequestRow;
};
type CustomRequestRow = {
  id?: string;
  provider_id?: string;
  customer_id?: string;
  service_name?: string;
  description?: string;
  location_type?: string;
  preferred_start_at?: string;
  address_line1?: string;
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_country?: string;
  address_postal_code?: string;
  service_category_id?: string;
};

async function lastResortCurrencyFromTenantId(
  tenantId: string | null | undefined,
  options?: { supabase?: SupabaseClient; providerId?: string | null | undefined },
): Promise<string> {
  if (tenantId) {
    const tr = await getTenantRegionConfig(tenantId);
    return tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  }
  const pid = options?.providerId;
  if (options?.supabase && pid) {
    const { data } = await options.supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", pid)
      .maybeSingle();
    const tid = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (tid) {
      const tr = await getTenantRegionConfig(tid);
      return tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    }
  }
  return LAST_RESORT_CURRENCY;
}

export async function finalizeCustomOfferPayment(
  adminSupabase: SupabaseClient,
  input: FinalizeCustomOfferPaymentInput,
): Promise<FinalizeCustomOfferPaymentResult> {
  const offerId = input.offerId;
  if (!offerId) return { ok: false, reason: "missing_offer_id" };

  // ── 1. Load offer + request ────────────────────────────────────────────────
  const { data: offerRow } = await adminSupabase
    .from("custom_offers")
    .select("*, request:custom_requests(*)")
    .eq("id", offerId)
    .single();
  if (!offerRow) return { ok: false, reason: "offer_not_found" };

  const offer = offerRow as OfferRow;
  const req = offer.request as CustomRequestRow | undefined;
  if (!req) return { ok: false, reason: "request_missing" };

  // ── 2. Idempotency ─────────────────────────────────────────────────────────
  if (offer.status === "paid") {
    return { ok: true, bookingId: offer.booking_id, reason: "already_paid" };
  }
  if (offer.status === "withdrawn" || offer.status === "expired") {
    console.warn(
      `[finalizeCustomOfferPayment] offer ${offerId} is ${offer.status}; refusing to create booking`,
    );
    return { ok: false, reason: offer.status };
  }

  // Reference-based dedupe: another concurrent finalize for the same payment.
  const { data: existingTx } = await adminSupabase
    .from("payment_transactions")
    .select("id, booking_id")
    .eq("reference", input.reference)
    .maybeSingle();
  if (existingTx) {
    return {
      ok: true,
      bookingId: (existingTx as { booking_id?: string }).booking_id,
      reason: "duplicate_reference",
    };
  }

  // ── 3. Currency + pricing inputs ───────────────────────────────────────────
  const { data: provForCurrency } = await adminSupabase
    .from("providers")
    .select("tenant_id")
    .eq("id", req.provider_id ?? "")
    .maybeSingle();
  const offerCurrencyFallback = await lastResortCurrencyFromTenantId(
    (provForCurrency as { tenant_id?: string } | null)?.tenant_id,
  );

  const meta = input.pricingMetadata || {};
  const travelFee =
    Number(meta.travel_fee ?? offer.travel_fee ?? 0) >= 0
      ? Number(meta.travel_fee ?? offer.travel_fee ?? 0)
      : 0;
  const tipAmount = Number(meta.tip_amount ?? 0);
  const taxAmount = Number(meta.tax_amount ?? 0);
  const taxRate = Number(meta.tax_rate ?? 0);
  const serviceFeeAmount = Number(meta.service_fee_amount ?? 0);
  const serviceFeePercentage = Number(meta.service_fee_percentage ?? 0);
  const promotionDiscountAmount = Number(meta.promotion_discount_amount ?? 0);
  const promotionId =
    meta.promotion_id && String(meta.promotion_id).trim() ? String(meta.promotion_id) : null;
  const coPaymentOption = String(meta.payment_option || "full");
  const coTotalAmount = Number(meta.total_amount || 0);
  const coDepositAmount = Number(meta.deposit_amount || 0);
  const coDepositPct = Number(meta.deposit_percentage || 0);
  const coRequiresDeposit = Boolean(meta.requires_deposit);
  const isDepositPayment = coPaymentOption === "deposit" && coDepositAmount > 0;

  const paystackAmountMajor = Math.max(0, Number(input.paystackAmountMajor || 0));
  const paystackFeesMajor = Math.max(0, Number(input.paystackFeesMajor || 0));
  const walletAmountApplied = Math.max(0, Number(input.walletAmountApplied || 0));
  const giftCardAmountApplied = Math.max(0, Number(input.giftCardAmountApplied || 0));
  let loyaltyPointsRedeemed = Math.max(0, Number(input.loyaltyPointsRedeemed || 0));
  let loyaltyDiscountAmount = Math.max(0, Number(input.loyaltyDiscountAmount || 0));

  const cashCollected = paystackAmountMajor + walletAmountApplied + giftCardAmountApplied;
  // For deposit, use the metadata total; otherwise the actual collected amount
  // (loyalty discount is reflected in pricing — not a tender — so doesn't add here).
  const bookingTotalAmount = isDepositPayment ? coTotalAmount : cashCollected;
  const netGatewayAmount = paystackAmountMajor - paystackFeesMajor;

  // ── 4. Create offering (ephemeral; cleaned up if booking insert fails) ────
  const offeringTitle =
    req.service_name && String(req.service_name).trim()
      ? String(req.service_name).trim()
      : "Custom Service";
  const { data: createdOffering, error: offeringError } = await adminSupabase
    .from("offerings")
    .insert({
      provider_id: req.provider_id,
      master_service_id: null,
      title: offeringTitle,
      description: req.description,
      category_id: req.service_category_id || null,
      subcategory_id: null,
      duration_minutes: offer.duration_minutes,
      buffer_minutes: 0,
      price: offer.price,
      currency: offer.currency || offerCurrencyFallback,
      supports_at_home: req.location_type === "at_home",
      supports_at_salon: req.location_type === "at_salon",
      is_active: false,
      display_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (offeringError || !createdOffering) {
    console.error("[finalizeCustomOfferPayment] Failed to create offering:", offeringError);
    await adminSupabase
      .from("custom_offers")
      .update({ status: "finalize_failed", updated_at: new Date().toISOString() })
      .eq("id", offerId);
    await patchCustomOfferMessageAttachments(adminSupabase, offerId, { status: "finalize_failed" });
    return { ok: false, reason: "offering_insert_failed" };
  }

  // ── 5. Resolve scheduled_at + booking insert (with conflict guard) ────────
  let scheduledAt: string;
  if (offer.scheduled_at) {
    scheduledAt = new Date(offer.scheduled_at).toISOString();
  } else if (req.preferred_start_at) {
    scheduledAt = new Date(req.preferred_start_at).toISOString();
  } else {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    nextHour.setMinutes(0, 0, 0);
    scheduledAt = nextHour.toISOString();
  }
  const bookingSubtotal = Number(offer.price || 0);

  const bookingInsert: Record<string, unknown> = {
    booking_number: "",
    customer_id: req.customer_id,
    provider_id: req.provider_id,
    custom_offer_id: offerId,
    status: "confirmed",
    location_type: req.location_type || "at_salon",
    location_id:
      req.location_type === "at_salon" && offer.location_id ? offer.location_id : null,
    scheduled_at: scheduledAt,
    subtotal: bookingSubtotal,
    tip_amount: tipAmount,
    discount_amount: promotionDiscountAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    service_fee_percentage: serviceFeePercentage,
    service_fee_amount: serviceFeeAmount,
    total_amount: bookingTotalAmount,
    currency: offer.currency || offerCurrencyFallback,
    payment_status: isDepositPayment ? "partially_paid" : "paid",
    ...(coRequiresDeposit
      ? {
          deposit_required: true,
          deposit_percentage: coDepositPct,
          deposit_amount: coDepositAmount,
          payment_option: coPaymentOption,
        }
      : {}),
    payment_reference: input.reference,
    payment_date: new Date().toISOString(),
    payment_provider:
      input.paymentProvider ??
      (paystackAmountMajor > 0 ? "paystack" : walletAmountApplied > 0 ? "wallet" : "gift_card"),
    booking_source: "online",
    special_requests: `Custom order: ${req.description}`,
    loyalty_points_earned: 0,
    loyalty_points_used: loyaltyPointsRedeemed,
    loyalty_discount_amount: loyaltyDiscountAmount,
    promotion_id: promotionId,
    promotion_discount_amount: promotionDiscountAmount,
    wallet_amount: walletAmountApplied,
    gift_card_amount: giftCardAmountApplied,
    ...(input.giftCardId ? { gift_card_id: input.giftCardId } : {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (
    req.location_type === "at_home" &&
    (req.address_line1 || req.address_city || req.address_country)
  ) {
    bookingInsert.address_line1 = req.address_line1 ?? null;
    bookingInsert.address_line2 = req.address_line2 ?? null;
    bookingInsert.address_city = req.address_city ?? null;
    bookingInsert.address_state = req.address_state ?? null;
    bookingInsert.address_country = req.address_country ?? null;
    bookingInsert.address_postal_code = req.address_postal_code ?? null;
  }
  if (travelFee > 0) {
    bookingInsert.travel_fee = travelFee;
  }

  // Conflict guard (mirror standard booking flow): re-schedule + flip to pending if the slot
  // was taken between offer acceptance and webhook delivery (paid customer must not be lost).
  const _start = new Date(scheduledAt);
  const _end = new Date(_start.getTime() + Number(offer.duration_minutes || 60) * 60 * 1000);
  const _staffId = offer.staff_id || null;
  let conflictResolved = false;
  try {
    const { checkBookingConflict, checkBookingConflictForProvider } = await import(
      "@/lib/bookings/conflict-check"
    );
    const conflictResult = _staffId
      ? await checkBookingConflict(adminSupabase, _staffId, _start, _end, 0)
      : await checkBookingConflictForProvider(
          adminSupabase,
          req.provider_id ?? "",
          _start,
          _end,
          0,
        );
    if (conflictResult.hasConflict) {
      console.warn(
        "[finalizeCustomOfferPayment] booking conflict detected, deferring to next available hour",
        {
          offerId,
          provider_id: req.provider_id,
          original: scheduledAt,
          conflicts: conflictResult.conflictingBookings,
        },
      );
      const next = new Date(Math.max(_end.getTime(), Date.now()) + 60 * 60 * 1000);
      next.setMinutes(0, 0, 0);
      scheduledAt = next.toISOString();
      bookingInsert.scheduled_at = scheduledAt;
      bookingInsert.status = "pending";
      bookingInsert.special_requests = `Custom order: ${req.description} — auto-rescheduled (slot conflict)`;
      conflictResolved = true;
    }
  } catch (conflictErr) {
    console.error(
      "[finalizeCustomOfferPayment] conflict check failed; proceeding anyway:",
      conflictErr,
    );
  }

  const { data: booking, error: bookingError } = await adminSupabase
    .from("bookings")
    .insert(bookingInsert)
    .select()
    .single();

  if (bookingError || !booking) {
    console.error("[finalizeCustomOfferPayment] Failed to create booking:", bookingError);
    try {
      await adminSupabase.from("offerings").delete().eq("id", createdOffering.id);
    } catch {
      /* best-effort */
    }
    await adminSupabase
      .from("custom_offers")
      .update({ status: "finalize_failed", updated_at: new Date().toISOString() })
      .eq("id", offerId);
    await patchCustomOfferMessageAttachments(adminSupabase, offerId, { status: "finalize_failed" });
    return { ok: false, reason: "booking_insert_failed" };
  }

  // ── 6. Booking service row ────────────────────────────────────────────────
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + Number(offer.duration_minutes || 60) * 60 * 1000);
  const assignedStaffId = offer.staff_id || null;
  if (conflictResolved) {
    try {
      await adminSupabase.from("booking_events").insert({
        booking_id: booking.id,
        event_type: "auto_rescheduled",
        event_data: {
          reason: "custom_offer_payment_slot_conflict",
          new_scheduled_at: scheduledAt,
        },
      });
    } catch {
      /* booking_events optional in test fixtures */
    }
  }

  const { error: bookingServiceError } = await adminSupabase.from("booking_services").insert({
    booking_id: booking.id,
    offering_id: createdOffering.id,
    staff_id: assignedStaffId,
    duration_minutes: Number(offer.duration_minutes || 60),
    price: bookingSubtotal,
    currency: offer.currency || offerCurrencyFallback,
    scheduled_start_at: start.toISOString(),
    scheduled_end_at: end.toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (bookingServiceError) {
    console.error(
      "[finalizeCustomOfferPayment] Failed to create booking service:",
      bookingServiceError,
    );
    await adminSupabase
      .from("bookings")
      .update({
        status: "cancelled",
        payment_status: "failed",
        cancellation_reason: "Custom offer finalization failed while creating booking service",
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    await adminSupabase
      .from("custom_offers")
      .update({ status: "finalize_failed", updated_at: new Date().toISOString() })
      .eq("id", offerId);
    await patchCustomOfferMessageAttachments(adminSupabase, offerId, { status: "finalize_failed" });
    return { ok: false, reason: "booking_service_insert_failed" };
  }

  // ── 7. Update offer status + attachment ────────────────────────────────────
  await adminSupabase
    .from("custom_offers")
    .update({
      status: "paid",
      booking_id: booking.id,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  await patchCustomOfferMessageAttachments(adminSupabase, offerId, {
    status: "paid",
    bookingId: booking.id,
  });

  // ── 8. booking_payments rows for each tender ───────────────────────────────
  const paystackTxId = paystackAmountMajor > 0 ? input.reference : null;
  const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;

  if (paystackAmountMajor > 0) {
    try {
      await adminSupabase.from("booking_payments").insert({
        booking_id: booking.id,
        ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
        amount: paystackAmountMajor,
        payment_method: "card",
        payment_provider: "paystack",
        payment_provider_id: paystackTxId,
        status: "completed",
        notes: isDepositPayment
          ? `Custom offer deposit payment. Ref: ${paystackTxId ?? ""}`
          : `Custom offer payment. Ref: ${paystackTxId ?? ""}`,
        payment_provider_data: {
          source: "custom_offer_finalize",
          custom_offer_id: offerId,
          payment_option: coPaymentOption,
        },
      });
    } catch (bpErr) {
      console.error("[finalizeCustomOfferPayment] booking_payments paystack insert failed:", bpErr);
    }
  }

  if (walletAmountApplied > 0 || giftCardAmountApplied > 0) {
    await ensureWalletGiftBookingPayments(adminSupabase, {
      bookingId: booking.id,
      tenantId: bookingTenantId,
      walletAmount: walletAmountApplied,
      giftCardAmount: giftCardAmountApplied,
    });
  }

  // Reserve + capture gift card redemption now that the booking exists.
  // The reserve RPC enforces balance + currency + active checks atomically and
  // is idempotent on `(booking_id)` so a webhook retry is safe.
  if (giftCardAmountApplied > 0) {
    const giftCode = (input.giftCardCode || "").toString().trim().toUpperCase();
    if (giftCode) {
      try {
        const { error: reserveErr } = await (adminSupabase.rpc as any)(
          "reserve_gift_card_redemption",
          {
            p_code: giftCode,
            p_amount: giftCardAmountApplied,
            p_booking_id: booking.id,
            p_currency: offer.currency || offerCurrencyFallback,
          },
        );
        if (reserveErr) {
          console.error(
            "[finalizeCustomOfferPayment] gift card reserve failed (booking still confirmed):",
            reserveErr,
          );
        }
      } catch (gcReserveErr) {
        console.error(
          "[finalizeCustomOfferPayment] gift card reserve threw (booking still confirmed):",
          gcReserveErr,
        );
      }
    }
    try {
      await (adminSupabase.rpc as any)("capture_gift_card_redemption", {
        p_booking_id: booking.id,
      });
    } catch (gcErr) {
      console.error(
        "[finalizeCustomOfferPayment] gift card capture failed (booking still confirmed):",
        gcErr,
      );
    }
  }

  // Loyalty redemption: append to ledger (idempotent on booking_id).
  if (loyaltyPointsRedeemed > 0 && req.customer_id) {
    try {
      const redemptionResult = await recordLoyaltyRedemption(adminSupabase, {
        customerId: req.customer_id,
        points: loyaltyPointsRedeemed,
        description: `Redeemed for custom offer ${offerId}`,
        bookingId: booking.id,
        metadata: { custom_offer_id: offerId },
      });
      if (!redemptionResult.recorded && redemptionResult.reason !== "already_redeemed") {
        throw new Error(redemptionResult.reason || "loyalty_redemption_not_recorded");
      }
    } catch (loyErr) {
      console.error("[finalizeCustomOfferPayment] loyalty redemption failed:", loyErr);
      loyaltyPointsRedeemed = 0;
      loyaltyDiscountAmount = 0;
      await adminSupabase
        .from("bookings")
        .update({
          loyalty_points_used: 0,
          loyalty_points_redeemed: 0,
          loyalty_discount_amount: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);
    }
  }

  // ── 9. legacy `payments` row (used by receipt + customer history) ─────────
  await adminSupabase.from("payments").insert({
    booking_id: booking.id,
    user_id: req.customer_id,
    provider_id: req.provider_id,
    payment_number: "",
    amount: cashCollected,
    currency: offer.currency || offerCurrencyFallback,
    status: "paid",
    payment_provider:
      input.paymentProvider ??
      (paystackAmountMajor > 0 ? "paystack" : walletAmountApplied > 0 ? "wallet" : "gift_card"),
    payment_provider_transaction_id: input.reference,
    payment_provider_response: {},
    processed_at: new Date().toISOString(),
    description: isDepositPayment ? `Custom offer deposit payment` : `Custom offer payment`,
    metadata: {
      custom_offer_id: offerId,
      payment_option: coPaymentOption,
      paystack_amount_applied: paystackAmountMajor,
      wallet_amount_applied: walletAmountApplied,
      gift_card_amount_applied: giftCardAmountApplied,
      loyalty_points_used: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // ── 10. Commission + finance ledger ───────────────────────────────────────
  const commissionRate = await resolveCommissionPercentageForProvider(adminSupabase, {
    tenantId: (provForCurrency as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    providerId: req.provider_id ?? null,
  });

  const rawCommissionBase =
    Number(meta.commission_base) > 0
      ? Number(meta.commission_base)
      : Math.max(0, bookingSubtotal - promotionDiscountAmount);

  // Scale commission to actually-collected cash (deposit / partial wallet) so reports tie
  // out against the ledger sum rather than the gross offer value.
  const scaleDenom = isDepositPayment ? coTotalAmount : Math.max(1, rawCommissionBase + travelFee);
  const scaleNumer = isDepositPayment ? cashCollected : Math.max(0, cashCollected);
  const commissionBase =
    scaleDenom > 0
      ? Math.max(0, Math.round((rawCommissionBase * scaleNumer) / scaleDenom * 100) / 100)
      : rawCommissionBase;
  const platformCommission = percentOf(commissionBase, commissionRate);
  const providerEarnings = subtractMoney(commissionBase, platformCommission);

  await adminSupabase.from("payment_transactions").insert({
    booking_id: booking.id,
    reference: input.reference,
    amount: cashCollected,
    fees: paystackFeesMajor,
    net_amount: cashCollected - paystackFeesMajor,
    status: "success",
    provider:
      input.paymentProvider ??
      (paystackAmountMajor > 0 ? "paystack" : walletAmountApplied > 0 ? "wallet" : "gift_card"),
    metadata: {
      custom_offer_id: offerId,
      customer_email: input.customerEmail ?? null,
      paystack_amount_applied: paystackAmountMajor,
      wallet_amount_applied: walletAmountApplied,
      gift_card_amount_applied: giftCardAmountApplied,
      loyalty_points_used: loyaltyPointsRedeemed,
      loyalty_discount_amount: loyaltyDiscountAmount,
      paystack_net_amount: netGatewayAmount,
    },
    created_at: new Date().toISOString(),
  });

  const customOfferFinanceTenantId = await resolveTenantIdForFinanceLedger(adminSupabase, {
    tenant_id: bookingTenantId,
    provider_id: req.provider_id,
  });

  await adminSupabase.from("finance_transactions").insert([
    {
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "payment",
      amount: commissionBase,
      fees: paystackFeesMajor,
      commission: platformCommission,
      net: platformCommission,
      description: `Custom order payment [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    },
    {
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "provider_earnings",
      amount: providerEarnings,
      fees: 0,
      commission: 0,
      net: providerEarnings,
      description: `Provider earnings (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    },
  ]);

  const extraRows: Array<Record<string, unknown>> = [];
  if (serviceFeeAmount > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "platform_fee",
      amount: serviceFeeAmount,
      fees: 0,
      commission: 0,
      net: serviceFeeAmount,
      description: `Platform fee (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (tipAmount > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "tip",
      amount: tipAmount,
      fees: 0,
      commission: 0,
      net: tipAmount,
      description: `Tip (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (taxAmount > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "tax",
      amount: taxAmount,
      fees: 0,
      commission: 0,
      net: 0,
      description: `Tax (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (travelFee > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "travel_fee",
      amount: travelFee,
      fees: 0,
      commission: 0,
      net: travelFee,
      description: `Travel fee (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (promotionDiscountAmount > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "promotion_discount",
      amount: promotionDiscountAmount,
      fees: 0,
      commission: 0,
      net: -promotionDiscountAmount,
      description: `Promotion discount (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (walletAmountApplied > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "wallet_payment",
      amount: walletAmountApplied,
      fees: 0,
      commission: 0,
      net: walletAmountApplied,
      description: `Wallet payment (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (giftCardAmountApplied > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "gift_card_payment",
      amount: giftCardAmountApplied,
      fees: 0,
      commission: 0,
      net: giftCardAmountApplied,
      description: `Gift card payment (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "gift_card_liability_reduction",
      amount: giftCardAmountApplied,
      fees: 0,
      commission: 0,
      net: -giftCardAmountApplied,
      description: `Gift card liability redeemed (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (loyaltyDiscountAmount > 0) {
    extraRows.push({
      booking_id: booking.id,
      provider_id: req.provider_id,
      tenant_id: customOfferFinanceTenantId,
      transaction_type: "loyalty_redemption",
      amount: loyaltyDiscountAmount,
      fees: 0,
      commission: 0,
      net: -loyaltyDiscountAmount,
      description: `Loyalty redemption (custom order) [custom_offer:${offerId}]`,
      created_at: new Date().toISOString(),
    });
  }
  if (extraRows.length > 0) {
    await adminSupabase.from("finance_transactions").insert(extraRows);
  }

  // Promotion usage (idempotent)
  if (promotionId && promotionDiscountAmount > 0) {
    try {
      await adminSupabase
        .from("promotion_usage")
        .insert({
          promotion_id: promotionId,
          user_id: req.customer_id,
          booking_id: booking.id,
          discount_amount: promotionDiscountAmount,
          used_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      const { data: promoRow } = await adminSupabase
        .from("promotions")
        .select("usage_count")
        .eq("id", promotionId)
        .single();
      const nextCount = Number((promoRow as { usage_count?: number } | null)?.usage_count || 0) + 1;
      await adminSupabase.from("promotions").update({ usage_count: nextCount }).eq("id", promotionId);
    } catch (promoErr) {
      const msg = promoErr instanceof Error ? promoErr.message : String(promoErr);
      if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
        console.error("[finalizeCustomOfferPayment] promotion_usage insert failed:", promoErr);
      }
    }
  }

  // Update custom request status to fulfilled
  await adminSupabase
    .from("custom_requests")
    .update({ status: "fulfilled", updated_at: new Date().toISOString() })
    .eq("id", req.id);

  // ── 11. Conversation message + push (best-effort) ──────────────────────────
  try {
    const { data: providerRow } = await adminSupabase
      .from("providers")
      .select("user_id")
      .eq("id", req.provider_id)
      .single();
    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id as
      | string
      | undefined;

    const offerMsgFilter = [
      { type: "custom_offer", offer_id: offerId },
    ] as unknown as Record<string, unknown>;
    const { data: offerSourceMsg } = await adminSupabase
      .from("messages")
      .select("conversation_id")
      .contains("attachments", offerMsgFilter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let convId = (offerSourceMsg as { conversation_id?: string } | null)?.conversation_id;

    if (!convId) {
      const { data: conv } = await adminSupabase
        .from("conversations")
        .select("id, booking_id")
        .eq("customer_id", req.customer_id)
        .eq("provider_id", req.provider_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      convId = (conv as { id?: string } | null)?.id;
    }

    if (convId) {
      const { data: convFull } = await adminSupabase
        .from("conversations")
        .select("id, booking_id")
        .eq("id", convId)
        .maybeSingle();
      const convRow = convFull as { id?: string; booking_id?: string } | null;
      if (!convRow?.booking_id) {
        await adminSupabase
          .from("conversations")
          .update({ booking_id: booking.id, updated_at: new Date().toISOString() })
          .eq("id", convId);
      }
      if (providerUserId) {
        await adminSupabase.from("messages").insert({
          conversation_id: convId,
          sender_id: providerUserId,
          sender_role: "provider_owner",
          content: `Payment received — booking created${
            booking.booking_number ? ` (#${booking.booking_number})` : ""
          }.`,
          attachments: [
            {
              type: "custom_offer_paid",
              offer_id: offerId,
              booking_id: booking.id,
              booking_number: booking.booking_number || null,
            },
          ],
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    }
  } catch (convErr) {
    console.error("[finalizeCustomOfferPayment] post-paid messaging failed:", convErr);
  }

  try {
    const { sendToUser } = await import("@/lib/notifications/onesignal");
    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    const { data: providerRow } = await adminSupabase
      .from("providers")
      .select("user_id")
      .eq("id", req.provider_id)
      .single();
    const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
    const baseData = {
      type: "custom_order_paid" as const,
      custom_offer_id: offerId,
      booking_id: booking.id,
    };
    if (req.customer_id) {
      const customerBookingUrl = `/account-settings/bookings/${booking.id}`;
      const customerOfferContext = `/account-settings/custom-requests?offer=${encodeURIComponent(
        offerId,
      )}`;
      await sendToUser(
        req.customer_id,
        {
          title: "Custom Order Paid",
          message: "Your custom order has been paid and a booking has been created.",
          data: baseData,
          url: customerBookingUrl,
        },
        ["push"],
        { appType: "customer" },
      );
      await insertNotification({
        user_id: req.customer_id,
        type: "custom_offer",
        title: "Booking Confirmed",
        message: "Your custom offer is paid and your booking is confirmed.",
        data: { ...baseData, custom_requests_url: customerOfferContext },
        action_url: customerBookingUrl,
      });
    }
    if (providerUserId) {
      await sendToUser(
        providerUserId,
        {
          title: "Custom Order Paid",
          message: "Your custom order has been paid and a booking has been created.",
          data: baseData,
          url: `/provider/bookings/${booking.id}`,
        },
        ["push"],
        { appType: "provider" },
      );
      await insertNotification({
        user_id: providerUserId,
        type: "custom_offer",
        title: "Custom Offer Paid",
        message: "A client paid your custom offer. Booking confirmed.",
        data: baseData,
        action_url: `/provider/bookings/${booking.id}`,
      });
    }
  } catch (notifyErr) {
    console.error("[finalizeCustomOfferPayment] notifications failed:", notifyErr);
  }

  return { ok: true, bookingId: booking.id as string };
}

/**
 * Convenience wrapper used by the Paystack webhook (`charge.success`).
 * Pulls split tenders out of the metadata blob the customer sent at init time.
 */
export async function finalizeCustomOfferPaymentFromPaystackEvent(
  adminSupabase: SupabaseClient,
  payload: {
    reference: string;
    metadata: Record<string, unknown>;
    amount?: number; // smallest unit
    fees?: number; // smallest unit
    customer?: { email?: string };
  },
): Promise<FinalizeCustomOfferPaymentResult> {
  const offerId = String(payload.metadata?.custom_offer_id ?? "");
  if (!offerId) return { ok: false, reason: "missing_offer_id" };

  return finalizeCustomOfferPayment(adminSupabase, {
    offerId,
    reference: payload.reference,
    paystackAmountMajor: convertFromSmallestUnit(payload.amount || 0),
    paystackFeesMajor: convertFromSmallestUnit(payload.fees || 0),
    walletAmountApplied: Number(payload.metadata?.wallet_amount_applied ?? 0),
    giftCardAmountApplied: Number(payload.metadata?.gift_card_amount_applied ?? 0),
    giftCardId: (payload.metadata?.gift_card_id as string | null | undefined) ?? null,
    giftCardCode: (payload.metadata?.gift_card_code as string | null | undefined) ?? null,
    loyaltyPointsRedeemed: Number(payload.metadata?.loyalty_points_used ?? 0),
    loyaltyDiscountAmount: Number(payload.metadata?.loyalty_discount_amount ?? 0),
    pricingMetadata: payload.metadata,
    customerEmail: payload.customer?.email ?? null,
    paymentProvider: "paystack",
  });
}
