import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Columns a signed-in session may read. Contact stays on the service role. */
export const PRODUCT_ORDER_COLUMNS_WITHOUT_CONTACT = [
  "id",
  "order_number",
  "customer_id",
  "provider_id",
  "status",
  "fulfillment_type",
  "delivery_address_id",
  "delivery_instructions",
  "tracking_number",
  "estimated_delivery_date",
  "collection_location_id",
  "subtotal",
  "tax_amount",
  "delivery_fee",
  "discount_amount",
  "total_amount",
  "currency",
  "payment_status",
  "payment_method",
  "payment_provider_id",
  "confirmed_at",
  "shipped_at",
  "delivered_at",
  "cancelled_at",
  "cancellation_reason",
  "created_at",
  "updated_at",
  "platform_fee",
  "order_source",
  "payment_reference",
  "paid_at",
  "staff_id",
  "customer_name",
  "wallet_amount",
  "tenant_id",
  "carrier",
  "tracking_url",
  "booking_id",
  "delivery_fee_type",
  "delivery_distance_km",
  "refund_method",
  "refunded_amount",
  "refunded_at",
  "refund_reason",
  "refund_customer_confirmation_required",
  "refund_customer_confirmed_at",
  "refund_customer_disputed_at",
  "refund_confirmation_deadline_at",
  "legacy_sale_id",
  "shipping_booking_status",
  "shipping_booking_detail",
  "courier_shipment_id",
  "courier_label_url",
  "courier_charged_amount",
  "courier_charged_weight_kg",
  "tax_inclusive",
  "provider_vat_number_snapshot",
  "delivery_address_snapshot",
  "payment_attempt_note",
  "promotion_id",
  "promotion_code",
  "promotion_discount_amount",
  "gift_card_id",
  "gift_card_amount",
  "partially_shipped_notified_at",
].join(", ");

type ContactRow = {
  id: string;
  customer_email?: string | null;
  customer_phone?: string | null;
};

/** Fill email and phone from the service role when the viewer is allowed to see clients. */
export async function mergeProductOrderContact<T extends { id: string }>(
  rows: T[],
  includeContact: boolean,
): Promise<T[]> {
  if (!includeContact || rows.length === 0) return rows;
  const ids = [...new Set(rows.map((row) => row.id).filter(Boolean))];
  if (ids.length === 0) return rows;
  const { data, error } = await getSupabaseAdmin()
    .from("product_orders")
    .select("id, customer_email, customer_phone")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map(
    ((data ?? []) as ContactRow[]).map((row) => [row.id, row]),
  );
  return rows.map((row) => {
    const contact = byId.get(row.id);
    if (!contact) return row;
    return {
      ...row,
      customer_email: contact.customer_email ?? null,
      customer_phone: contact.customer_phone ?? null,
    };
  });
}
