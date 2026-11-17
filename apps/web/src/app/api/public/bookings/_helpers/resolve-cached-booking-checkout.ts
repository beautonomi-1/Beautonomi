import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAndSettleOnlinePayment } from "@/lib/payments/resolve-online-verify";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { getAppBaseUrl } from "@/lib/env/app-url";
import { getOnlinePaymentCheckoutByReference } from "@/lib/payments/online-payment-checkouts";
import { expectedHostedCardAmountMajor } from "@/lib/bookings/verify-paystack-booking-charge";

export type CachedCheckoutResolution =
  | {
      kind: "payable";
      bookingId: string;
      paymentUrl: string | null;
      paymentReference: string | null;
      alreadyPaid?: false;
    }
  | {
      kind: "already_paid";
      bookingId: string;
      paymentUrl: null;
      paymentReference: string | null;
      alreadyPaid: true;
    }
  | { kind: "dead"; bookingId?: string };

function gatewaySessionDead(provider: string | null, raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const body = raw as Record<string, unknown>;
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  const status = String(data.status ?? data.payment_status ?? "")
    .trim()
    .toLowerCase();
  // "abandoned" / "open" / "pending" mean the same hosted session can still be
  // paid, so the cached URL (same reference) is kept. Only a gateway answer that
  // cannot recover (expired session, failed or reversed transaction) re-initialises.
  if (provider === "stripe") {
    return status === "expired";
  }
  return (
    status === "failed" ||
    status === "reversed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "expired"
  );
}

/**
 * Decide what an idempotent replay (or consumed-hold resume) should return.
 */
export async function resolveCachedBookingCheckout(
  admin: SupabaseClient,
  bookingId: string,
  userId: string,
  cachedPaymentUrl?: string | null,
): Promise<CachedCheckoutResolution> {
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, payment_reference, payment_provider, tenant_id, customer_id, booking_number, currency, total_amount, deposit_amount, payment_option, reschedule_credit_pending, wallet_amount, gift_card_amount, tip_amount, tax_amount, provider_id",
    )
    .eq("id", bookingId)
    .eq("customer_id", userId)
    .maybeSingle();

  if (!booking) {
    return { kind: "dead", bookingId };
  }

  const row = booking as {
    id: string;
    status?: string | null;
    payment_status?: string | null;
    payment_reference?: string | null;
    payment_provider?: string | null;
    tenant_id?: string | null;
    booking_number?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    deposit_amount?: number | null;
    payment_option?: string | null;
    reschedule_credit_pending?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
    tip_amount?: number | null;
    tax_amount?: number | null;
    provider_id?: string | null;
  };

  const status = String(row.status ?? "").toLowerCase();
  const payStatus = String(row.payment_status ?? "").toLowerCase();

  if (payStatus === "paid" || payStatus === "succeeded") {
    return {
      kind: "already_paid",
      bookingId: row.id,
      paymentUrl: null,
      paymentReference: row.payment_reference ?? null,
      alreadyPaid: true,
    };
  }

  if (status === "cancelled" || status === "no_show" || status === "declined") {
    return { kind: "dead", bookingId: row.id };
  }

  const payable =
    (status === "pending_payment" || status === "pending" || status === "confirmed") &&
    payStatus === "pending";

  if (!payable) {
    return { kind: "dead", bookingId: row.id };
  }

  const reference = String(row.payment_reference ?? "").trim();
  if (reference) {
    try {
      const probed = await verifyAndSettleOnlinePayment(
        { reference, tenantId: row.tenant_id ?? null },
        admin,
      );
      if (probed.paid) {
        if (probed.provider === "paystack" && probed.paystackVerifyJson) {
          const { processSuccessfulPayment } = await import(
            "@/app/api/payments/webhook/_handlers/charge-success"
          );
          const verifyJson = probed.paystackVerifyJson as { data?: Record<string, unknown> };
          const chargeData = (verifyJson?.data ?? verifyJson) as never;
          if (chargeData && typeof chargeData === "object") {
            await processSuccessfulPayment(chargeData, admin);
          }
        }
        return {
          kind: "already_paid",
          bookingId: row.id,
          paymentUrl: null,
          paymentReference: reference,
          alreadyPaid: true,
        };
      }

      if (gatewaySessionDead(probed.provider, probed.paystackVerifyJson)) {
        const refreshed = await refreshHostedCheckoutUrl(admin, row, userId);
        if (refreshed) {
          return {
            kind: "payable",
            bookingId: row.id,
            paymentUrl: refreshed.paymentUrl,
            paymentReference: refreshed.reference,
          };
        }
      }
    } catch (err) {
      console.warn("[resolveCachedBookingCheckout] gateway probe failed", bookingId, err);
    }
  }

  return {
    kind: "payable",
    bookingId: row.id,
    paymentUrl: cachedPaymentUrl ?? null,
    paymentReference: reference || null,
  };
}

async function refreshHostedCheckoutUrl(
  admin: SupabaseClient,
  row: {
    id: string;
    tenant_id?: string | null;
    booking_number?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    deposit_amount?: number | null;
    payment_option?: string | null;
    reschedule_credit_pending?: number | null;
    wallet_amount?: number | null;
    gift_card_amount?: number | null;
    payment_reference?: string | null;
  },
  userId: string,
): Promise<{ paymentUrl: string; reference: string } | null> {
  try {
    const { data: userRow } = await admin
      .from("users")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = String((userRow as { email?: string } | null)?.email ?? "").trim();
    if (!email) return null;

    // Card amount after wallet, gift card and reschedule credit; honours deposits.
    const amountToCollect = expectedHostedCardAmountMajor(row);
    if (!(amountToCollect > 0)) return null;

    const currency = String(row.currency ?? "ZAR").toUpperCase();

    // Keep the routing metadata (payment option, tender, cancel link) the first
    // checkout was issued with so settlement behaves the same on the new reference.
    const previousReference = String(row.payment_reference ?? "").trim();
    const previousCheckout = previousReference
      ? await getOnlinePaymentCheckoutByReference(previousReference)
      : null;
    const previousMetadata = previousCheckout?.metadata ?? {};

    const reference = generateTransactionReference("booking", row.id);
    const base = getAppBaseUrl();
    const callbackUrl = `${base}/checkout/success?booking_id=${encodeURIComponent(row.id)}&booking_number=${encodeURIComponent(row.booking_number || "")}`;

    const onlineInit = await initializeOnlinePayment({
      tenantId: row.tenant_id ?? null,
      email,
      amountInSmallestUnit: convertToSmallestUnit(amountToCollect, currency),
      currency,
      reference,
      callbackUrl,
      lineItemName: `Booking ${row.booking_number || row.id}`,
      metadata: {
        ...previousMetadata,
        booking_id: row.id,
        customer_id: userId,
        amount_to_collect: amountToCollect,
        cancel_action:
          typeof previousMetadata.cancel_action === "string"
            ? previousMetadata.cancel_action
            : `${base}/checkout/cancelled?booking_id=${encodeURIComponent(row.id)}`,
      },
    });

    await admin
      .from("bookings")
      .update({
        payment_reference: reference,
        payment_provider: onlineInit.provider,
        payment_status: "pending",
        status: "pending_payment",
      })
      .eq("id", row.id)
      .eq("customer_id", userId)
      .eq("payment_status", "pending");

    const { data: pendingPay } = await admin
      .from("payments")
      .select("id")
      .eq("booking_id", row.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingPay?.id) {
      await admin
        .from("payments")
        .update({
          payment_provider: onlineInit.provider,
          payment_provider_transaction_id: reference,
          payment_provider_response: onlineInit,
          amount: amountToCollect,
          currency,
        })
        .eq("id", pendingPay.id);
    }

    const url = onlineInit.authorizationUrl ?? null;
    if (!url) return null;
    return { paymentUrl: url, reference };
  } catch (err) {
    console.error("[resolveCachedBookingCheckout] refresh hosted checkout failed", row.id, err);
    return null;
  }
}
