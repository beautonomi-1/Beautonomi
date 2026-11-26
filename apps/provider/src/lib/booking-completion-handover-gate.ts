import { buildBookingCompletionChecklist } from "@beautonomi/provider-booking";
import { collectBookingProductLines, subtractMoney, addMoney } from "@beautonomi/utils";
import { api } from "@/lib/api-client";

type BookingDetailRow = {
  payment_status?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  outstanding_balance?: number | null;
  products?: unknown[];
  product_orders?: { id?: string; status?: string | null; fulfillment_type?: string | null }[];
  additional_charges?: { amount?: number | null; status?: string | null }[];
};

export async function bookingNeedsHandoverBeforeComplete(bookingId: string): Promise<boolean> {
  const detail = await api.get<BookingDetailRow>(`/api/provider/bookings/${bookingId}`);
  const row = detail.data;
  if (!row) return false;

  let orders = row.product_orders ?? [];
  if (orders.length === 0 && collectBookingProductLines(row).length > 0) {
    try {
      const linked = await api.get<{
        orders?: { id: string; status?: string | null; fulfillment_type?: string | null }[];
      }>(`/api/provider/product-orders?booking_id=${encodeURIComponent(bookingId)}&limit=20`);
      orders = linked.data?.orders ?? [];
    } catch {
      orders = row.product_orders ?? [];
    }
  }

  const totalAmount = Number(row.total_amount ?? 0) || 0;
  const totalPaid = Number(row.total_paid ?? 0) || 0;
  const totalRefunded = Number(row.total_refunded ?? 0) || 0;
  const walletAmountApplied = Number(row.wallet_amount ?? 0);
  const giftCardAmountApplied = Number(row.gift_card_amount ?? 0);
  const effectivePaid = Math.max(0, subtractMoney(totalPaid, totalRefunded));
  const walletGiftCoverage = addMoney(walletAmountApplied, giftCardAmountApplied);
  const coverageLocal = Math.max(effectivePaid, walletGiftCoverage);
  const outstandingRawLocal = subtractMoney(totalAmount, coverageLocal);
  const serverOutstanding = Number(row.outstanding_balance);
  const outstanding =
    row.outstanding_balance != null && Number.isFinite(serverOutstanding)
      ? Math.max(0, serverOutstanding)
      : Math.max(0, outstandingRawLocal);

  const unpaidAdditionalCharges = (row.additional_charges ?? [])
    .filter((c) => c?.status !== "paid" && c?.status !== "rejected")
    .reduce((sum, c) => addMoney(sum, Number(c?.amount ?? 0)), 0);

  const checklist = buildBookingCompletionChecklist({
    status: null,
    paymentStatus: row.payment_status,
    outstanding,
    unpaidAdditionalCharges,
    productOrders: orders,
    hasProductsOnBooking: collectBookingProductLines(row).length > 0,
  });
  return checklist.blockers.some((blocker) => blocker.code !== "refunded");
}