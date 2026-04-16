import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  successResponse,
  handleApiError,
  requireRoleInApi,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { trackServer } from "@/lib/analytics/amplitude/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";
import { syncBookingAfterPaystackSuccess } from "@/lib/bookings/sync-booking-after-paystack-success";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { tryCreateCustomerRecurringFromPaystackChargeMetadata } from "@/lib/recurring/try-create-recurring-from-paystack-metadata";

/**
 * GET /api/paystack/verify
 * 
 * Verify Paystack payment status
 * Requires authentication (any role)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const { searchParams } = new URL(request.url);
    const reference =
      searchParams.get("reference") || searchParams.get("trxref");

    if (!reference) {
      return successResponse({ status: "error", message: "Reference required" });
    }

    const PAYSTACK_SECRET_KEY = await getPaystackSecretKey({ tenantId });

    if (!PAYSTACK_SECRET_KEY) {
      throw new Error("Paystack secret key not configured");
    }

    // Verify payment with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (!paystackResponse.ok) {
      throw new Error("Failed to verify payment");
    }

    const data = await paystackResponse.json();

    if (data.data.status === "success") {
      const metadata = data.data.metadata || {};
      const supabase = await getSupabaseServer();
      const tenantRegion = await getTenantRegionConfig(tenantId);
      const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
      const paidCurrency =
        typeof data.data.currency === "string" && data.data.currency.length >= 3
          ? data.data.currency.toUpperCase()
          : fallbackCurrency;

      // Handle product order payments
      const productOrderId = metadata.product_order_id;
      if (productOrderId) {
        const { data: poBefore } = await (supabase.from("product_orders") as any)
          .select("tenant_id, provider_id")
          .eq("id", productOrderId)
          .maybeSingle();

        if (!poBefore) {
          return notFoundResponse("Product order not found");
        }

        if (
          !resourceTenantMatchesHostTenant(
            tenantId,
            (poBefore as { tenant_id?: string | null }).tenant_id,
          )
        ) {
          return errorResponse(
            "This order belongs to a different market. Open checkout from the correct site or app for this order.",
            "TENANT_MISMATCH",
            403,
          );
        }

        const productOrderTenantId = await resolveTenantIdForFinanceLedger(supabase, {
          tenant_id: (poBefore as { tenant_id?: string | null }).tenant_id,
          provider_id: (poBefore as { provider_id?: string | null }).provider_id,
        });
        await recordProductOrderPayment({
          supabase: getSupabaseAdmin() as any,
          productOrderId,
          reference,
          amountMajor: Number(data.data.amount || 0) / 100,
          feesMajor: Number(data.data.fees || 0) / 100,
          source: "paystack_verify",
          provider: "paystack",
        });

        const { data: po } = await (supabase.from("product_orders") as any)
          .select("customer_id, provider_id, order_number, total_amount")
          .eq("id", productOrderId)
          .single();

        if (po) {
          const amountMajor = data.data.amount / 100;
          const { format: fmtPo } = await getTenantMoneyFormatter(productOrderTenantId);
          void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
            insertNotification({
              user_id: po.customer_id,
              type: "product_order_update",
              title: "Order Confirmed",
              message: `Your order ${po.order_number} has been confirmed and paid.`,
              data: { product_order_id: productOrderId, amount: amountMajor },
              action_url: `/product-orders`,
            })
          );

          if (po.provider_id) {
            await notifyProviderTeamUsers(po.provider_id, {
              type: "product_order_update",
              title: "New Product Order",
              message: `New product order ${po.order_number} received — ${fmtPo(amountMajor)}.`,
              data: { product_order_id: productOrderId, amount: amountMajor },
              action_url: `/provider/ecommerce/orders?order=${encodeURIComponent(productOrderId)}`,
            });
          }
        }

        // Track payment via Amplitude
        trackServer("product_order_paid", {
          order_id: productOrderId,
          order_number: po?.order_number,
          amount: data.data.amount / 100,
          payment_method: "paystack",
          currency: paidCurrency,
        }, po?.customer_id).catch(() => {});

        return successResponse({
          status: "success",
          productOrderId,
          orderNumber: po?.order_number,
          type: "product_order",
          message: "Payment verified successfully",
        });
      }

      // Handle booking payments
      const bookingId = metadata.bookingId || metadata.booking_id;

      if (!bookingId) {
        console.error("Booking ID not found in payment metadata");
        return successResponse({
          status: "error",
          message: "Booking ID not found in payment metadata",
        });
      }

      const { data: booking, error: bookingLookupError } = await supabase
        .from("bookings")
        .select(
          "id, tenant_id, customer_id, provider_id, booking_number, ref_number, total_amount, scheduled_at, payment_status, status, cancelled_at",
        )
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingLookupError || !booking) {
        return notFoundResponse("Booking not found");
      }

      if (booking.customer_id !== user.id) {
        return errorResponse(
          "You can only confirm payments for your own bookings.",
          "FORBIDDEN",
          403,
        );
      }

      if (!resourceTenantMatchesHostTenant(tenantId, booking.tenant_id)) {
        return errorResponse(
          "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
          "TENANT_MISMATCH",
          403,
        );
      }

      if (booking.status === "cancelled" || booking.cancelled_at) {
        return errorResponse(
          "This booking was cancelled. If you were charged, contact support for a refund.",
          "BOOKING_CANCELLED",
          409,
        );
      }

      const paymentStatusBefore =
        (booking.payment_status as string) || "pending";

      // 1. Record Paystack payment in booking_payments (RLS blocks customer INSERT; use admin).
      //    Trigger update_booking_payment_status syncs payment_status + total_paid (deposit vs full).
      const admin = getSupabaseAdmin();
      const paystackTxId =
        data.data.id !== undefined && data.data.id !== null
          ? String(data.data.id)
          : null;
      const amountMajor = data.data.amount / 100;
      let newPaymentRow = false;
      if (paystackTxId) {
        const { data: existingBp } = await admin
          .from("booking_payments")
          .select("id")
          .eq("payment_provider", "paystack")
          .eq("payment_provider_id", paystackTxId)
          .maybeSingle();
        if (!existingBp) {
          const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;
          const { error: bpErr } = await admin.from("booking_payments").insert({
            booking_id: bookingId,
            ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
            amount: amountMajor,
            payment_method: "card",
            payment_provider: "paystack",
            payment_provider_id: paystackTxId,
            status: "completed",
            notes: `Payment verified via Paystack (client redirect). Ref: ${reference}`,
            payment_provider_data: {
              paystack_reference: reference,
              paystack_metadata: metadata,
              source: "paystack_verify_route",
            },
          });
          if (bpErr && bpErr.code !== "23505") {
            console.error("booking_payments insert from verify failed:", bpErr);
          } else if (!bpErr) {
            newPaymentRow = true;
          }
        }
      }

      await syncBookingAfterPaystackSuccess(admin, bookingId, {
        paymentReference: reference,
        paymentProvider: "paystack",
      });

      // Failsafe: if the DB trigger set payment_status to "partially_paid" because it
      // only sums booking_payments rows and doesn't account for wallet/gift card amounts, we fix it here.
      {
        const { data: fsRow } = await admin
          .from("bookings")
          .select("total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, status, provider_id, confirmed_at")
          .eq("id", bookingId)
          .maybeSingle();
        if (fsRow) {
          const fsTotalAmount = Number((fsRow as Record<string, unknown>).total_amount ?? 0);
          const fsTotalPaid = Number((fsRow as Record<string, unknown>).total_paid ?? 0);
          const fsTotalRefunded = Number((fsRow as Record<string, unknown>).total_refunded ?? 0);
          const fsWalletAmount = Number((fsRow as Record<string, unknown>).wallet_amount ?? 0);
          const fsGiftCardAmount = Number((fsRow as Record<string, unknown>).gift_card_amount ?? 0);
          const fsEffectivePaid = Math.max(0, fsTotalPaid - fsTotalRefunded);
          const fsPs = (fsRow as Record<string, unknown>).payment_status as string || "pending";
          if (
            fsTotalAmount > 0 &&
            fsEffectivePaid + fsWalletAmount + fsGiftCardAmount >= fsTotalAmount - 0.01 &&
            fsPs !== "paid"
          ) {
            const fsUpdates: Record<string, unknown> = { payment_status: "paid" };
            // Re-apply auto-confirm in case it was skipped due to partially_paid status
            if (fsRow.provider_id) {
              const { getAppointmentSettingsFromDB } = await import("@/lib/provider-portal/appointment-settings");
              const fsSettings = await getAppointmentSettingsFromDB(admin, fsRow.provider_id as string);
              const fsStatus = (fsRow as Record<string, unknown>).status as string;
              if (!fsSettings.requireConfirmationForBookings && fsStatus !== "confirmed" && fsStatus !== "completed") {
                fsUpdates.status = "confirmed";
                if (!(fsRow as Record<string, unknown>).confirmed_at) {
                  fsUpdates.confirmed_at = new Date().toISOString();
                }
              }
            }
            await admin.from("bookings").update(fsUpdates).eq("id", bookingId);
          }
        }
      }

      try {
        await tryCreateCustomerRecurringFromPaystackChargeMetadata(
          admin,
          metadata as Record<string, unknown>,
        );
      } catch (recurringErr) {
        console.error("[recurring] paystack verify booking path:", recurringErr);
      }

      const { data: afterPay } = await admin
        .from("bookings")
        .select("payment_status")
        .eq("id", bookingId)
        .maybeSingle();
      const psAfter = ((afterPay?.payment_status as string) || "pending") as string;
      const paymentJustCleared =
        paymentStatusBefore === "pending" &&
        (psAfter === "paid" || psAfter === "partially_paid");

      let providerOwnerUserId: string | null = null;
      if (booking.provider_id) {
        const { data: prov } = await supabase
          .from("providers")
          .select("user_id")
          .eq("id", booking.provider_id)
          .maybeSingle();
        providerOwnerUserId = prov?.user_id ?? null;
      }

      if (paymentJustCleared && newPaymentRow) {
        void import("@/lib/notifications/insert-notification").then(async ({ insertNotifications }) => {
          const rows = [
            {
              user_id: booking.customer_id as string,
              type: "booking_confirmation",
              title: "Booking Confirmed",
              message: `Your booking ${booking.ref_number || booking.booking_number} has been confirmed.`,
              data: { booking_id: bookingId, amount: data.data.amount / 100 } as Record<string, unknown>,
              action_url: `/account-settings/bookings/${bookingId}`,
            },
            ...(providerOwnerUserId ? [{
              user_id: providerOwnerUserId as string,
              type: "new_appointment",
              title: "New Booking Received",
              message: `New booking ${booking.ref_number || booking.booking_number} confirmed.`,
              data: { booking_id: bookingId, amount: data.data.amount / 100 } as Record<string, unknown>,
              action_url: `/provider/bookings/${bookingId}`,
            }] : []),
          ];
          await insertNotifications(rows);
        });
      }

      // Gift card capture (only on first recorded Paystack payment for this tx)
      if (paymentJustCleared && newPaymentRow && metadata.gift_card_id && metadata.gift_card_amount) {
        const giftCardAmount = parseFloat(metadata.gift_card_amount);
        await supabase.rpc("deduct_gift_card_balance", {
          p_gift_card_id: metadata.gift_card_id,
          p_amount: giftCardAmount,
          p_booking_id: bookingId,
        });
      }

      // 4. Deduct loyalty points if used (idempotent: check for existing redemption for this booking)
      if (paymentJustCleared && newPaymentRow && metadata.loyalty_points_used && parseInt(metadata.loyalty_points_used) > 0) {
        const pointsUsed = parseInt(metadata.loyalty_points_used);
        const { data: existing } = await supabase
          .from("loyalty_point_transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("reference_id", bookingId)
          .eq("reference_type", "booking")
          .eq("transaction_type", "redeemed")
          .maybeSingle();
        if (!existing) {
          await supabase.from("loyalty_point_transactions").insert({
            user_id: user.id,
            points: pointsUsed,
            transaction_type: "redeemed",
            description: `Redeemed for booking`,
            reference_id: bookingId,
            reference_type: "booking",
          });
          await supabase.from("bookings").update({ loyalty_points_used: pointsUsed }).eq("id", bookingId);
        }
      }

      // 5. Apply coupon usage
      if (paymentJustCleared && newPaymentRow && metadata.coupon_code) {
        const { data: promo } = await supabase
          .from("promotions")
          .select("current_uses")
          .eq("code", metadata.coupon_code)
          .single();

        if (promo) {
          await supabase
            .from("promotions")
            .update({ current_uses: (promo.current_uses || 0) + 1 })
            .eq("code", metadata.coupon_code);
        }

        await supabase.from("promotion_uses").insert({
          promotion_code: metadata.coupon_code,
          user_id: user.id,
          booking_id: bookingId,
          used_at: new Date().toISOString(),
        });
      }

      return successResponse({
        status: "success",
        bookingId: bookingId,
        message: "Payment verified successfully",
        payment_status: psAfter,
        duplicate: !newPaymentRow && !paymentJustCleared,
      });
    }

    return successResponse({
      status: "failed",
      message: "Payment verification failed",
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify payment");
  }
}
