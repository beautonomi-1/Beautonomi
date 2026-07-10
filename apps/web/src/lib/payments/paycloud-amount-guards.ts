import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWalletGiftCoverageOutstanding } from "@/lib/bookings/provider-booking-finance";

export async function computeExpectedAmountForEntity(
  supabase: SupabaseClient,
  providerId: string,
  entityType: string,
  entityId: string,
): Promise<{ amount: number; currency: string; bookingLocationId?: string | null } | null> {
  switch (entityType) {
    case "booking": {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, status, location_id, additional_charges(amount,status)",
        )
        .eq("id", entityId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!booking || booking.status === "cancelled" || booking.status === "no_show") return null;
      const unpaidAdditional = Array.isArray((booking as any).additional_charges)
        ? (booking as any).additional_charges
            .filter((c: any) => c?.status !== "paid" && c?.status !== "rejected")
            .reduce((s: number, c: any) => s + Number(c?.amount || 0), 0)
        : 0;
      const remaining = computeWalletGiftCoverageOutstanding({
        totalAmount: Number(booking.total_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        totalRefunded: Number(booking.total_refunded ?? 0),
        walletAmount: Number(booking.wallet_amount ?? 0),
        giftCardAmount: Number(booking.gift_card_amount ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
      });
      return { amount: remaining, currency: booking.currency ?? "ZAR", bookingLocationId: booking.location_id };
    }
    case "group_booking": {
      const { data: bookings } = await supabase
        .from("bookings")
        .select(
          "total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, additional_charges(amount,status)",
        )
        .eq("group_booking_id", entityId)
        .eq("provider_id", providerId)
        .not("status", "in", "(cancelled,no_show)");
      if (!bookings?.length) return null;
      let total = 0;
      const currency = bookings[0]?.currency ?? "ZAR";
      for (const booking of bookings) {
        const unpaidAdditional = Array.isArray((booking as any).additional_charges)
          ? (booking as any).additional_charges
              .filter((c: any) => c?.status !== "paid" && c?.status !== "rejected")
              .reduce((s: number, c: any) => s + Number(c?.amount || 0), 0)
          : 0;
        total += computeWalletGiftCoverageOutstanding({
          totalAmount: Number(booking.total_amount ?? 0),
          totalPaid: Number(booking.total_paid ?? 0),
          totalRefunded: Number(booking.total_refunded ?? 0),
          walletAmount: Number(booking.wallet_amount ?? 0),
          giftCardAmount: Number(booking.gift_card_amount ?? 0),
          unpaidAdditionalCharges: unpaidAdditional,
        });
      }
      return { amount: total, currency, bookingLocationId: null };
    }
    case "sale": {
      const { data: sale } = await supabase
        .from("sales")
        .select("total_amount, currency, payment_status")
        .eq("id", entityId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!sale || sale.payment_status === "completed") return null;
      return { amount: Number(sale.total_amount ?? 0), currency: sale.currency ?? "ZAR" };
    }
    case "product_order": {
      const { data: order } = await supabase
        .from("product_orders")
        .select("total_amount, wallet_amount, currency, payment_status, status, order_source")
        .eq("id", entityId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!order) return null;
      if (order.order_source === "appointment") return null;
      if (order.payment_status === "paid") return null;
      if (order.status === "cancelled" || order.status === "refunded") return null;
      const amount = Math.max(0, Number(order.total_amount ?? 0) - Number(order.wallet_amount ?? 0));
      return { amount, currency: order.currency ?? "ZAR" };
    }
    case "additional_charge": {
      const { data: charge } = await supabase
        .from("additional_charges")
        .select("id, amount, currency, status, booking_id, bookings!inner(provider_id, location_id, currency)")
        .eq("id", entityId)
        .maybeSingle();
      if (!charge) return null;
      const booking = (charge as any).bookings;
      if (!booking || booking.provider_id !== providerId) return null;
      if (charge.status === "paid" || charge.status === "rejected") return null;
      return {
        amount: Number(charge.amount ?? 0),
        currency: charge.currency ?? booking.currency ?? "ZAR",
        bookingLocationId: booking.location_id ?? null,
      };
    }
    default:
      return null;
  }
}

export function computeAmountMatchStatus(
  expected: number,
  captured: number,
): "exact" | "over" | "under" | "mismatch" {
  const diff = Math.abs(captured - expected);
  if (diff < 0.01) return "exact";
  if (captured > expected) return "over";
  if (captured < expected * 0.99) return "under";
  return "mismatch";
}
