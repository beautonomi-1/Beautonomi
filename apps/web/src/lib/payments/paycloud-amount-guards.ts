import type { SupabaseClient } from "@supabase/supabase-js";
import { computeWalletGiftCoverageOutstanding } from "@/lib/bookings/provider-booking-finance";
import { sumPendingWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { computePaycloudBookingChargeAmount } from "@/lib/payments/paycloud-booking-charge";
import { additionalChargeAmountStillDue } from "@/lib/bookings/display-invariants";
import { sumAdditionalChargeTenderLegs } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import {
  saleCardAmountStillDue,
  sumSaleGiftCardPaid,
  sumSuccessfulSaleCardTakenBySaleIds,
} from "@/lib/gift-cards/sale-gift-card";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export async function computeExpectedAmountForEntity(
  supabase: SupabaseClient,
  providerId: string,
  entityType: string,
  entityId: string,
): Promise<{
  amount: number;
  currency: string;
  bookingLocationId?: string | null;
  depositAmount?: number | null;
  fullOutstanding?: number;
  /** Booking balance excluding unpaid add-on charges. Checkout collects those separately. */
  serviceOutstanding?: number;
} | null> {
  switch (entityType) {
    case "booking": {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, status, location_id, deposit_required, deposit_amount, payment_option, additional_charges(amount,status)",
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
      const pendingWalletGift = await sumPendingWalletGiftBookingPayments(supabase, entityId);
      const remaining = computeWalletGiftCoverageOutstanding({
        totalAmount: Number(booking.total_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        totalRefunded: Number(booking.total_refunded ?? 0),
        walletAmount: Number(booking.wallet_amount ?? 0),
        giftCardAmount: Number(booking.gift_card_amount ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
        pendingWalletGiftAmount: pendingWalletGift,
      });
      const depositQuote = computePaycloudBookingChargeAmount({
        outstanding: remaining,
        depositRequired: Boolean((booking as { deposit_required?: boolean }).deposit_required),
        depositAmount: Number((booking as { deposit_amount?: number }).deposit_amount ?? 0),
        totalPaid: Number(booking.total_paid ?? 0),
        unpaidAdditionalCharges: unpaidAdditional,
        pendingWalletGiftAmount: pendingWalletGift,
      });
      const depositAmount = depositQuote.depositAmount;
      const serviceOutstanding = Math.max(0, Math.round((remaining - unpaidAdditional) * 100) / 100);
      return {
        amount: remaining,
        currency: booking.currency ?? "ZAR",
        bookingLocationId: booking.location_id,
        depositAmount,
        fullOutstanding: remaining,
        serviceOutstanding,
      };
    }
    case "group_booking": {
      const { data: bookings } = await supabase
        .from("bookings")
        .select(
          "id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, additional_charges(amount,status)",
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
        const bookingId = String((booking as { id?: string }).id ?? "");
        const pendingWalletGift = bookingId
          ? await sumPendingWalletGiftBookingPayments(supabase, bookingId)
          : 0;
        total += computeWalletGiftCoverageOutstanding({
          totalAmount: Number(booking.total_amount ?? 0),
          totalPaid: Number(booking.total_paid ?? 0),
          totalRefunded: Number(booking.total_refunded ?? 0),
          walletAmount: Number(booking.wallet_amount ?? 0),
          giftCardAmount: Number(booking.gift_card_amount ?? 0),
          unpaidAdditionalCharges: unpaidAdditional,
          pendingWalletGiftAmount: pendingWalletGift,
        });
      }
      return { amount: total, currency, bookingLocationId: null };
    }
    case "sale": {
      const { data: sale } = await supabase
        .from("sales")
        .select("total_amount, payment_status")
        .eq("id", entityId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!sale || sale.payment_status === "completed") return null;
      const giftPaid = await sumSaleGiftCardPaid(supabase, entityId);
      const cardTaken =
        (await sumSuccessfulSaleCardTakenBySaleIds(supabase, [entityId])).get(entityId) ?? 0;
      return {
        amount: saleCardAmountStillDue(Number(sale.total_amount ?? 0), giftPaid, cardTaken),
        currency: LAST_RESORT_CURRENCY,
      };
    }
    case "product_order": {
      const { data: order } = await supabase
        .from("product_orders")
        .select("total_amount, wallet_amount, gift_card_amount, currency, payment_status, status, order_source")
        .eq("id", entityId)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!order) return null;
      if (order.order_source === "appointment") return null;
      if (order.payment_status === "paid") return null;
      if (order.status === "cancelled" || order.status === "refunded") return null;
      const { productOrderCardAmountStillDue } = await import(
        "@/lib/payments/resolve-paystack-initialize-amount"
      );
      const due = await productOrderCardAmountStillDue(supabase, entityId, "");
      if (due.ok === false) return null;
      return { amount: due.due, currency: order.currency ?? "ZAR" };
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
      const bookingId = String((charge as { booking_id?: string }).booking_id ?? "");
      const held = bookingId
        ? await sumAdditionalChargeTenderLegs(supabase, bookingId, String(charge.id))
        : { wallet: 0, gift: 0 };
      const stillDue = additionalChargeAmountStillDue(
        Number(charge.amount ?? 0),
        held.wallet + held.gift,
      );
      return {
        amount: stillDue,
        currency: charge.currency ?? booking.currency ?? "ZAR",
        bookingLocationId: booking.location_id ?? null,
      };
    }
    default:
      return null;
  }
}

/**
 * A tip on a booking that is already paid has no service balance to send as the
 * order amount. The terminal charges the tip once. Settlement still reads tip_amount.
 */
export function paycloudTerminalTipAmount(input: {
  chargeAmount: number;
  tipAmount: number;
  serviceOutstanding: number | null | undefined;
}): number {
  const tip = Math.max(0, Number(input.tipAmount) || 0);
  const outstanding = input.serviceOutstanding;
  if (
    tip > 0.01 &&
    outstanding != null &&
    outstanding <= 0.02 &&
    Math.abs((Number(input.chargeAmount) || 0) - tip) <= 0.02
  ) {
    return 0;
  }
  return tip;
}

export function computeAmountMatchStatus(
  expected: number,
  captured: number,
  extras?: { tipAmount?: number | null; cashbackAmount?: number | null },
): "exact" | "over" | "under" | "mismatch" {
  // Tips/cashback are authorized on top of the base order. PayCloud reports may
  // return the base order_amount or the full paid_amount, so any combination of
  // expected ± authorized extras is an exact capture — not an exception.
  const tip = Math.max(0, Number(extras?.tipAmount ?? 0));
  const cashback = Math.max(0, Number(extras?.cashbackAmount ?? 0));
  const acceptable = [expected, expected + tip, expected + cashback, expected + tip + cashback];
  if (acceptable.some((value) => Math.abs(captured - value) < 0.01)) return "exact";
  if (captured > expected + tip + cashback) return "over";
  if (captured < expected * 0.99) return "under";
  return "mismatch";
}

/**
 * Yoco sends one amount that already includes the tip. The service portion must be
 * the balance, the deposit still due, or the service balance without unpaid add-ons.
 */
export function yocoChargeMatchesExpected(input: {
  amount: number;
  tipAmount?: number | null;
  expectedAmount: number;
  depositAmount?: number | null;
  serviceOutstanding?: number | null;
}): boolean {
  const tip = Math.max(0, Number(input.tipAmount) || 0);
  const base = Math.max(0, Math.round((Number(input.amount) - tip) * 100) / 100);
  const acceptable = [Math.max(0, Number(input.expectedAmount) || 0)];
  const deposit = Number(input.depositAmount ?? 0);
  if (deposit > 0.01) acceptable.push(deposit);
  const service = input.serviceOutstanding;
  if (service != null && service > 0.01 && Math.abs(service - acceptable[0]) > 0.02) {
    acceptable.push(service);
  }
  return acceptable.some((candidate) => Math.abs(base - candidate) <= 0.02);
}
