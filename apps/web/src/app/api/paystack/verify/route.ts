import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { trackServer } from "@/lib/analytics/amplitude/server";

/**
 * GET /api/paystack/verify
 * 
 * Verify Paystack payment status
 * Requires authentication (any role)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return successResponse({ status: "error", message: "Reference required" });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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

      // Handle product order payments
      const productOrderId = metadata.product_order_id;
      if (productOrderId) {
        const { error: poErr } = await (supabase.from("product_orders") as any)
          .update({
            payment_status: "paid",
            payment_reference: reference,
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
          })
          .eq("id", productOrderId);

        if (poErr) console.error("Failed to update product order:", poErr);

        const { data: po } = await (supabase.from("product_orders") as any)
          .select("customer_id, provider_id, order_number, total_amount")
          .eq("id", productOrderId)
          .single();

        // Look up the provider owner's user_id for notifications
        let providerOwnerUserId: string | null = null;
        if (po?.provider_id) {
          const { data: providerOwner } = await supabase
            .from("providers")
            .select("owner_id")
            .eq("id", po.provider_id)
            .single();
          providerOwnerUserId = providerOwner?.owner_id ?? null;
        }

        if (po) {
          const notifications: any[] = [
            {
              user_id: po.customer_id,
              type: "product_order_confirmed",
              title: "Order Confirmed",
              message: `Your order ${po.order_number} has been confirmed and paid.`,
              metadata: { product_order_id: productOrderId, amount: data.data.amount / 100 },
              link: `/product-orders`,
            },
          ];
          if (providerOwnerUserId) {
            notifications.push({
              user_id: providerOwnerUserId,
              type: "product_order_placed",
              title: "New Product Order",
              message: `New product order ${po.order_number} received — R${(data.data.amount / 100).toFixed(2)}.`,
              metadata: { product_order_id: productOrderId, amount: data.data.amount / 100 },
              link: `/provider/ecommerce/orders`,
            });
          }
          await supabase.from("notifications").insert(notifications).then(() => {}, (e: any) => console.error("Notification insert failed:", e));
        }

        // Track payment via Amplitude
        trackServer("product_order_paid", {
          order_id: productOrderId,
          order_number: po?.order_number,
          amount: data.data.amount / 100,
          payment_method: "paystack",
          currency: "ZAR",
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

      // 1. Update booking status to confirmed
      const { error: updateError } = await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          payment_status: "paid",
          payment_reference: reference,
          paid_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      if (updateError) {
        console.error("Failed to update booking status:", updateError);
      }

      // 2. Send confirmation notification (insert into notifications table)
      const { data: booking } = await supabase
        .from("bookings")
        .select("customer_id, provider_id, booking_number, ref_number, total_amount, scheduled_at")
        .eq("id", bookingId)
        .single();

      if (booking) {
        await supabase.from("notifications").insert([
          {
            user_id: booking.customer_id,
            type: "booking_confirmed",
            title: "Booking Confirmed",
            message: `Your booking ${booking.ref_number || booking.booking_number} has been confirmed.`,
            metadata: { booking_id: bookingId, amount: data.data.amount / 100 },
            link: `/account-settings/bookings/${bookingId}`,
          },
          {
            user_id: booking.provider_id,
            type: "new_booking",
            title: "New Booking Received",
            message: `New booking ${booking.ref_number || booking.booking_number} confirmed.`,
            metadata: { booking_id: bookingId, amount: data.data.amount / 100 },
            link: `/provider/bookings/${bookingId}`,
          },
        ]);
      }

      // 3. Update gift card balance if used
      if (metadata.gift_card_id && metadata.gift_card_amount) {
        const giftCardAmount = parseFloat(metadata.gift_card_amount);
        await supabase.rpc("deduct_gift_card_balance", {
          p_gift_card_id: metadata.gift_card_id,
          p_amount: giftCardAmount,
          p_booking_id: bookingId,
        });
      }

      // 4. Deduct loyalty points if used (idempotent: check for existing redemption for this booking)
      if (metadata.loyalty_points_used && parseInt(metadata.loyalty_points_used) > 0) {
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
      if (metadata.coupon_code) {
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
