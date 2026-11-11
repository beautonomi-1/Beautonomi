import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { initiatePaycloudRefund } from "@/lib/payments/initiate-paycloud-refund";
import { getPaycloudNotifyUrl } from "@/lib/payments/paycloud-credentials";
import { computeRefundCaps } from "@/lib/bookings/booking-refund-limits";
import { isPlatformCollected } from "@/lib/bookings/payment-collected-classifier";
import { addMoney } from "@beautonomi/utils";
import { clientMajorAmountSchema } from "@/lib/payments/client-amount-bounds";

/**
 * POST /api/provider/additional-charges/[id]/refund
 * Reverse a paid additional charge via terminal REFUND (preferred) or wallet/cash record.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("issue_refunds", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;

    const { id: chargeId } = await params;
    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const body = await request.json().catch(() => ({}));
    let amount = Number(body?.amount);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    const rawMethod =
      typeof body?.refund_method === "string" ? body.refund_method.trim().toLowerCase() : "original";
    const refundMethod =
      rawMethod === "original" || rawMethod === "terminal" || rawMethod === "paycloud"
        ? "original"
        : rawMethod === "cash"
          ? "cash"
          : rawMethod === "store_credit" || rawMethod === "wallet"
            ? "store_credit"
            : null;
    if (!refundMethod) {
      return errorResponse(
        "refund_method must be 'store_credit', 'cash', or 'original' (card machine reversal)",
        "VALIDATION_ERROR",
        400,
      );
    }

    const parsedAmount = clientMajorAmountSchema.safeParse(amount);
    if (!parsedAmount.success) {
      return errorResponse("Refund amount must be greater than 0", "VALIDATION_ERROR", 400);
    }
    amount = parsedAmount.data;
    if (!reason) {
      return errorResponse("Refund reason is required", "VALIDATION_ERROR", 400);
    }

    const { data: charge } = await supabaseAdmin
      .from("additional_charges")
      .select("id, amount, status, booking_id, currency, bookings!inner(provider_id, customer_id, tenant_id)")
      .eq("id", chargeId)
      .maybeSingle();

    if (!charge || (charge as { bookings?: { provider_id?: string } }).bookings?.provider_id !== providerId) {
      return notFoundResponse("Additional charge not found");
    }
    if (charge.status !== "paid") {
      return errorResponse("Only paid additional charges can be refunded", "INVALID_STATUS", 400);
    }
    if (amount > Number(charge.amount ?? 0) + 0.02) {
      return errorResponse("Refund amount exceeds the charge amount", "INVALID_AMOUNT", 400);
    }

    const bookingId = (charge as { booking_id?: string }).booking_id;
    if (!bookingId) {
      return errorResponse("Charge is not linked to a booking", "INVALID_CHARGE", 400);
    }

    if (refundMethod === "original") {
      const { data: pcPayments } = await supabaseAdmin
        .from("provider_paycloud_payments")
        .select("id, terminal_id, status, trans_type, additional_charge_id, booking_id")
        .eq("provider_id", providerId)
        .eq("status", "successful")
        .or(`additional_charge_id.eq.${chargeId},and(entity_type.eq.additional_charge,entity_id.eq.${chargeId})`)
        .order("created_at", { ascending: false })
        .limit(5);

      type SaleRow = { id: string; terminal_id: string | null; trans_type?: number | null };
      let salePayment: SaleRow | undefined = (pcPayments ?? []).find((p) => {
        const tt = Number(p.trans_type ?? 1);
        return tt === 1 || tt === 11;
      }) as SaleRow | undefined;

      if (!salePayment) {
        const { data: bookingLevel } = await supabaseAdmin
          .from("provider_paycloud_payments")
          .select("id, terminal_id, status, trans_type")
          .eq("provider_id", providerId)
          .eq("booking_id", bookingId)
          .eq("status", "successful")
          .order("created_at", { ascending: false })
          .limit(5);
        salePayment = (bookingLevel ?? []).find((p) => {
          const tt = Number(p.trans_type ?? 1);
          return tt === 1 || tt === 11;
        }) as SaleRow | undefined;
      }

      if (!salePayment) {
        return errorResponse(
          "No card machine payment found for this charge. Use wallet credit or cash instead.",
          "NO_TERMINAL_PAYMENT",
          400,
        );
      }

      const initiate = await initiatePaycloudRefund({
        supabase: supabaseAdmin,
        providerId,
        paymentId: salePayment.id,
        amount,
        processedBy: permissionCheck.user.id,
        notifyUrl: getPaycloudNotifyUrl(request),
        terminalId: salePayment.terminal_id,
      });

      if (initiate.ok === false) {
        return errorResponse(initiate.message, initiate.code, initiate.status);
      }

      return successResponse({
        charge_id: chargeId,
        booking_id: bookingId,
        paycloud_refund: initiate.refundPayment,
        pending_terminal: true,
        message: "Refund sent to the card machine — follow the prompts.",
      });
    }

    // Wallet/cash: record against the parent booking (shared caps / ledger).
    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, currency, payment_status, total_paid, total_refunded, wallet_amount, gift_card_amount, tenant_id, provider_id, booking_number, ref_number")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!booking) return notFoundResponse("Booking not found");

    let chargeOnlineCap: number | null = null;
    if (refundMethod === "store_credit") {
      const bookingCaps = await computeRefundCaps(supabaseAdmin, bookingId, {
        customer_id: booking.customer_id,
        total_paid: booking.total_paid,
        total_refunded: booking.total_refunded,
        wallet_amount: booking.wallet_amount,
        gift_card_amount: booking.gift_card_amount,
        tenant_id: booking.tenant_id,
      });
      const { data: chargePayments } = await supabaseAdmin
        .from("booking_payments")
        .select("amount, payment_method, payment_provider, payment_provider_id, payment_provider_data, status")
        .eq("booking_id", bookingId)
        .in("status", ["completed", "partially_refunded"]);
      const linked = (chargePayments ?? []).filter((p) => {
        const data = (p.payment_provider_data ?? {}) as { additional_charge_id?: string };
        return (
          data.additional_charge_id === chargeId ||
          String(p.payment_provider_id ?? "").endsWith(`:additional:${chargeId}`)
        );
      });
      const linkedOnline = linked
        .filter((p) => isPlatformCollected(p))
        .reduce((s, p) => addMoney(s, Number(p.amount ?? 0)), 0);
      chargeOnlineCap =
        linked.length > 0 ? Math.min(linkedOnline, bookingCaps.onlineCap) : bookingCaps.onlineCap;
      if (amount > chargeOnlineCap + 0.01) {
        return errorResponse(
          `Wallet refunds for this charge are limited to ${chargeOnlineCap.toFixed(2)} paid online. Refund in-person amounts as cash or on the card machine.`,
          "WALLET_REFUND_CAP_EXCEEDED",
          400,
        );
      }
    }

    const { data: refund, error: refundError } = await supabaseAdmin
      .from("booking_refunds")
      .insert({
        booking_id: bookingId,
        amount,
        reason: `Additional charge refund: ${reason}`,
        refund_method: refundMethod,
        status: "pending",
        notes: `Charge ${chargeId}: ${reason}`,
        created_by: permissionCheck.user.id,
        customer_confirmation_required: refundMethod === "cash" && !!booking.customer_id,
      })
      .select()
      .single();

    if (refundError || !refund) {
      return errorResponse("Failed to create refund record", "REFUND_ERROR", 500);
    }

    if (refundMethod === "store_credit") {
      if (!booking.customer_id) {
        await supabaseAdmin.from("booking_refunds").update({ status: "failed" }).eq("id", refund.id);
        return errorResponse("No customer account to credit. Use cash instead.", "NO_WALLET_CUSTOMER", 400);
      }
      const { resolveTenantIdForFinanceLedger } = await import("@/lib/finance/resolve-tenant-id-for-ledger");
      const walletTenantId = await resolveTenantIdForFinanceLedger(supabaseAdmin, {
        tenant_id: booking.tenant_id,
        provider_id: booking.provider_id,
      });
      const { error: walletError } = await (supabaseAdmin.rpc as any)("wallet_credit_admin", {
        p_user_id: booking.customer_id,
        p_amount: amount,
        p_currency: booking.currency || "ZAR",
        p_description: `Refund for additional charge on booking ${booking.booking_number || bookingId}: ${reason}`,
        p_reference_id: bookingId,
        p_reference_type: "booking_refund",
        p_tenant_id: walletTenantId,
        p_idempotency_key: `provider_charge_refund:${refund.id}`,
      });
      if (walletError) {
        await supabaseAdmin.from("booking_refunds").update({ status: "failed" }).eq("id", refund.id);
        return errorResponse("Failed to credit customer wallet", "WALLET_ERROR", 500);
      }
    }

    await supabaseAdmin.from("booking_refunds").update({ status: "completed" }).eq("id", refund.id);

    try {
      const { syncBookingRefundTransactions } = await import(
        "@/lib/finance/sync-booking-refund-transactions"
      );
      await syncBookingRefundTransactions(
        supabaseAdmin,
        bookingId,
        `Additional charge refund: ${reason}`,
        permissionCheck.user.id,
      );
    } catch (syncErr) {
      console.warn("Failed to sync payment transaction after charge refund:", syncErr);
    }

    if (amount + 0.01 >= Number(charge.amount ?? 0)) {
      await supabaseAdmin
        .from("additional_charges")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", chargeId);
    }

    try {
      await supabaseAdmin.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "refund_issued_by_staff",
        event_data: {
          refund_id: refund.id,
          additional_charge_id: chargeId,
          amount,
          reason,
          refund_method: refundMethod,
          charge_online_cap: chargeOnlineCap,
          actor_user_id: permissionCheck.user.id,
        },
        created_by: permissionCheck.user.id,
      });
      const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
      const ref = booking.ref_number || booking.booking_number || bookingId.slice(0, 8).toUpperCase();
      await notifyProviderTeamUsers(
        providerId,
        {
          type: "staff_refund_issued",
          title: "Refund issued",
          message: `A ${amount.toFixed(2)} ${refundMethod.replace("_", " ")} refund was issued on an extra charge for booking ${ref}.`,
          data: { booking_id: bookingId, refund_id: refund.id, amount, refund_method: refundMethod },
        },
        { managersOnly: true, push: true },
      );
    } catch (auditErr) {
      console.warn("Failed to record charge refund audit:", auditErr);
    }

    return successResponse({
      charge_id: chargeId,
      booking_id: bookingId,
      refund,
    });
  } catch (error) {
    return handleApiError(error, "Failed to refund additional charge");
  }
}
