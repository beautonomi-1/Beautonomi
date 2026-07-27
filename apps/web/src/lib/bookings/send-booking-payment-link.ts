import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";

export interface SendBookingPaymentLinkInput {
  bookingId: string;
  /** Human-facing reference shown in the notification (booking number / ref). */
  bookingRef: string;
  customerId: string;
  tenantId: string | null;
  /** Recorded on the notification payload so support can trace where a link came from. */
  source: string;
  amounts: {
    totalAmount: number;
    totalPaid?: number;
    totalRefunded?: number;
    walletAmount?: number;
    giftCardAmount?: number;
    paymentStatus?: string | null;
  };
}

export interface SendBookingPaymentLinkResult {
  ok: boolean;
  paymentLink: string | null;
  amountDue: number;
  /** Provider-facing messages to bubble up in the API response. */
  warnings: string[];
}

/**
 * Create the in-app payment-link notification for a booking and push it out over
 * push / email / SMS.
 *
 * Callers are responsible for the payment-link feature flag and for deciding
 * whether the customer should be notified at all; this only does the send, and
 * reports delivery problems as warnings rather than throwing, because a booking
 * that already exists must never be failed by a notification hiccup.
 */
export async function sendBookingPaymentLink(
  supabaseAdmin: SupabaseClient,
  input: SendBookingPaymentLinkInput,
): Promise<SendBookingPaymentLinkResult> {
  const warnings: string[] = [];

  const amountDue = computeBookingOutstandingDisplay({
    totalAmount: Number(input.amounts.totalAmount ?? 0),
    totalPaid: Number(input.amounts.totalPaid ?? 0),
    totalRefunded: Number(input.amounts.totalRefunded ?? 0),
    walletAmount: Number(input.amounts.walletAmount ?? 0),
    giftCardAmount: Number(input.amounts.giftCardAmount ?? 0),
    unpaidAdditionalCharges: 0,
    paymentStatus: input.amounts.paymentStatus ?? undefined,
  });

  if (amountDue <= 0) {
    return { ok: false, paymentLink: null, amountDue, warnings };
  }

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const paymentLink = `${appBase}/bookings/${input.bookingId}/pay`;
  if (!appBase) {
    // A relative path still resolves inside the app, but it is dead in an SMS
    // or email — say so rather than letting the customer hit a broken link.
    warnings.push(
      "The payment link was sent without a full web address, so it may not open from email or SMS. Set the app URL in your environment settings.",
    );
  }

  try {
    const { format: formatMoney } = await getTenantMoneyFormatter(input.tenantId);

    const { data: customerContact } = await supabaseAdmin
      .from("users")
      .select("email, phone")
      .eq("id", input.customerId)
      .maybeSingle();
    const customerEmail = (customerContact as { email?: string | null } | null)?.email;
    const customerPhone = (customerContact as { phone?: string | null } | null)?.phone;

    const { insertNotification } = await import("@/lib/notifications/insert-notification");
    await insertNotification({
      user_id: input.customerId,
      type: "payment_link_sent",
      title: "Payment Link Ready",
      message: `Pay ${formatMoney(amountDue)} for booking ${input.bookingRef}. Open: ${paymentLink}`,
      data: {
        booking_id: input.bookingId,
        booking_ref: input.bookingRef,
        amount: amountDue,
        payment_link: paymentLink,
        source: input.source,
      },
      action_url: paymentLink,
    });

    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      const channels: ("push" | "email" | "sms")[] = ["push"];
      if (customerEmail) channels.push("email");
      if (customerPhone) channels.push("sms");
      await sendTemplateNotification(
        "payment_pending",
        [input.customerId],
        {
          amount: formatMoney(amountDue),
          booking_number: String(input.bookingRef),
          payment_method: "Paystack",
          booking_id: input.bookingId,
          payment_link: paymentLink,
        },
        channels,
        // In-app bell row inserted manually above; skip template auto-insert.
        { appType: "customer", skipInApp: true },
      );
    } catch (pushError) {
      console.warn("[sendBookingPaymentLink] delivery failed:", pushError);
      warnings.push(
        "Payment link was created, but push/email/SMS delivery could not be confirmed.",
      );
    }

    return { ok: true, paymentLink, amountDue, warnings };
  } catch (error) {
    console.warn("[sendBookingPaymentLink] failed:", error);
    warnings.push(
      "Booking was created, but the payment link could not be sent automatically. Send it from booking details.",
    );
    return { ok: false, paymentLink, amountDue, warnings };
  }
}
