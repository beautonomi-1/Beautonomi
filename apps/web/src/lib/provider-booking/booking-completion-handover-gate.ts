import { buildBookingCompletionChecklist } from "@beautonomi/provider-booking";
import { collectBookingProductLines, addMoney } from "@beautonomi/utils";
import { fetcher } from "@/lib/http/fetcher";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";

type BookingDetailRow = {
  payment_status?: string | null;
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
  outstanding_balance?: number | null;
  products?: unknown[];
  booking_products?: unknown[];
  product_orders?: Array<{ id?: string; status?: string | null; fulfillment_type?: string | null }>;
  additional_charges?: Array<{ amount?: number | null; status?: string | null }>;
};

export async function fetchBookingCompletionChecklist(bookingId: string) {
  const response = await fetcher.get<{ data: BookingDetailRow }>(`/api/provider/bookings/${bookingId}`);
  const row = response.data;
  if (!row) {
    return buildBookingCompletionChecklist({
      status: null,
      paymentStatus: null,
      outstanding: 0,
      unpaidAdditionalCharges: 0,
      productOrders: [],
      hasProductsOnBooking: false,
    });
  }

  const unpaidAdditionalCharges = (row.additional_charges ?? [])
    .filter((c) => c?.status !== "paid" && c?.status !== "rejected")
    .reduce((sum, c) => addMoney(sum, Number(c?.amount ?? 0)), 0);

  const outstanding = computeBookingOutstandingDisplay({
    totalAmount: Number(row.total_amount ?? 0),
    totalPaid: Number(row.total_paid ?? 0),
    totalRefunded: Number(row.total_refunded ?? 0),
    walletAmount: Number(row.wallet_amount ?? 0),
    giftCardAmount: Number(row.gift_card_amount ?? 0),
    unpaidAdditionalCharges,
    paymentStatus: row.payment_status,
  });

  return buildBookingCompletionChecklist({
    status: null,
    paymentStatus: row.payment_status,
    outstanding,
    unpaidAdditionalCharges,
    productOrders: row.product_orders ?? [],
    hasProductsOnBooking: collectBookingProductLines(row).length > 0,
  });
}

export async function bookingNeedsHandoverBeforeComplete(bookingId: string): Promise<boolean> {
  const checklist = await fetchBookingCompletionChecklist(bookingId);
  return !checklist.allDone;
}