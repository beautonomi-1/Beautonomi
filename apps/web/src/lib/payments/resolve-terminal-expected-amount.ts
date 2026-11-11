/**
 * F3-17: Paystack Terminal collection intent display amount.
 * When an entity is named, derive remaining due from the server row.
 * Client `expected_amount` is only a hint for ad-hoc (no entity / `other`) collections.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCurrency, addMoney } from "@beautonomi/utils";
import { additionalChargeAmountStillDue, computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { sumAdditionalChargeTenderLegs } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { saleCardAmountStillDueForSale } from "@/lib/gift-cards/sale-gift-card";
import { productOrderCardAmountStillDue } from "@/lib/payments/resolve-paystack-initialize-amount";

export function terminalExpectedAmountForDisplay(input: {
  derived: number | null;
  hasEntity: boolean;
  clientHint?: number | null;
}): number | null {
  if (input.hasEntity) return input.derived;
  const hint = input.clientHint;
  if (typeof hint === "number" && Number.isFinite(hint) && hint >= 0) {
    return roundCurrency(hint);
  }
  return null;
}

export async function resolveTerminalExpectedAmount(
  supabase: SupabaseClient,
  providerId: string,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): Promise<number | null> {
  const type = String(entityType ?? "").trim();
  const id = String(entityId ?? "").trim();
  if (!type || !id || type === "other") return null;

  if (type === "booking") {
    const { data: booking } = await supabase
      .from("bookings")
      .select(
        "id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status",
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!booking) return null;
    return roundCurrency(
      computeBookingOutstandingDisplay({
        totalAmount: Number((booking as { total_amount?: number | null }).total_amount ?? 0),
        totalPaid: Number((booking as { total_paid?: number | null }).total_paid ?? 0),
        totalRefunded: Number((booking as { total_refunded?: number | null }).total_refunded ?? 0),
        walletAmount: Number((booking as { wallet_amount?: number | null }).wallet_amount ?? 0),
        giftCardAmount: Number((booking as { gift_card_amount?: number | null }).gift_card_amount ?? 0),
        unpaidAdditionalCharges: 0,
        paymentStatus: (booking as { payment_status?: string | null }).payment_status ?? null,
      }),
    );
  }

  if (type === "additional_charge") {
    const { data: charge } = await (supabase.from("additional_charges") as any)
      .select("id, amount, booking_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!charge) return null;
    const bookingId = (charge as { booking_id?: string | null }).booking_id ?? null;
    if (!bookingId) return null;
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!booking) return null;
    const held = await sumAdditionalChargeTenderLegs(supabase, bookingId, id);
    return additionalChargeAmountStillDue(Number((charge as { amount?: number | null }).amount ?? 0), addMoney(held.wallet, held.gift));
  }

  if (type === "product_order") {
    const due = await productOrderCardAmountStillDue(supabase, id, "");
    return due.ok ? due.due : null;
  }

  if (type === "sale") {
    return saleCardAmountStillDueForSale(supabase, providerId, id);
  }

  if (type === "invoice") {
    const { data: invoice } = await (supabase.from("provider_invoices") as any)
      .select("id, total_amount, amount_paid")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!invoice) return null;
    return roundCurrency(
      Math.max(
        0,
        Number((invoice as { total_amount?: number | null }).total_amount ?? 0) -
          Number((invoice as { amount_paid?: number | null }).amount_paid ?? 0),
      ),
    );
  }

  if (type === "group_booking") {
    const { data: children } = await supabase
      .from("bookings")
      .select("total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status")
      .eq("group_booking_id", id)
      .eq("provider_id", providerId);
    const rows = (children ?? []) as Array<{
      total_amount?: number | null;
      total_paid?: number | null;
      total_refunded?: number | null;
      wallet_amount?: number | null;
      gift_card_amount?: number | null;
      payment_status?: string | null;
    }>;
    if (rows.length === 0) return null;
    return roundCurrency(
      rows.reduce(
        (sum, row) =>
          sum +
          computeBookingOutstandingDisplay({
            totalAmount: Number(row.total_amount ?? 0),
            totalPaid: Number(row.total_paid ?? 0),
            totalRefunded: Number(row.total_refunded ?? 0),
            walletAmount: Number(row.wallet_amount ?? 0),
            giftCardAmount: Number(row.gift_card_amount ?? 0),
            unpaidAdditionalCharges: 0,
            paymentStatus: row.payment_status ?? null,
          }),
        0,
      ),
    );
  }

  return null;
}
