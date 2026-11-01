export const CARD_MACHINE_EXCEPTION_ROW_CAP = 500;

export function isYocoPaymentException(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase() === "pending";
}

export function isPaycloudPaymentException(amountMatchStatus: string | null | undefined): boolean {
  const s = amountMatchStatus ?? "";
  if (!s) return false;
  return s !== "exact" && s !== "pending";
}

export type YocoPaymentRow = {
  id: string;
  yoco_payment_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  appointment_id?: string | null;
  sale_id?: string | null;
  created_at?: string | null;
};

export function yocoPaymentMatchesLocation(
  row: YocoPaymentRow,
  locationId: string,
  matchingBookingIds: Set<string>,
  matchingSaleIds: Set<string>,
): boolean {
  if (row.appointment_id && matchingBookingIds.has(row.appointment_id)) return true;
  if (row.sale_id && matchingSaleIds.has(row.sale_id)) return true;
  return false;
}

export type PaycloudPaymentRow = {
  id: string;
  merchant_order_no?: string | null;
  amount?: number | null;
  expected_amount?: number | null;
  amount_match_status?: string | null;
  status?: string | null;
  created_at?: string | null;
  booking_id?: string | null;
  sale_id?: string | null;
  group_booking_id?: string | null;
  product_order_id?: string | null;
};

export function paycloudPaymentMatchesLocation(
  row: PaycloudPaymentRow,
  locationId: string,
  matchingBookingIds: Set<string>,
  matchingSaleIds: Set<string>,
  matchingGroupBookingIds: Set<string>,
  matchingProductOrderIds: Set<string>,
): boolean {
  if (row.booking_id && matchingBookingIds.has(row.booking_id)) return true;
  if (row.sale_id && matchingSaleIds.has(row.sale_id)) return true;
  if (row.group_booking_id && matchingGroupBookingIds.has(row.group_booking_id)) return true;
  if (row.product_order_id && matchingProductOrderIds.has(row.product_order_id)) return true;
  return false;
}
