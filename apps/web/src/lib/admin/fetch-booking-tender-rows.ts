import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefundListRow } from "@/lib/admin/refund-list-normalize";

/**
 * Bookings paid in-person (booking_payments only, no gateway capture row) are
 * invisible to payment_transactions queries. Synthesize placeholder rows so
 * the booking-centric queue can surface them.
 */
export async function fetchBookingTenderSyntheticRows(
  supabase: SupabaseClient,
  tenantId: string,
  bookingIds: string[],
): Promise<RefundListRow[]> {
  const unique = [...new Set(bookingIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const [{ data: bookings }, { data: gatewayRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        status,
        payment_status,
        total_amount,
        total_paid,
        total_refunded,
        wallet_amount,
        gift_card_amount,
        customer_id,
        provider_id,
        tenant_id,
        created_at,
        customer:users!bookings_customer_id_fkey(id, full_name, email),
        provider:providers!bookings_provider_id_fkey(id, business_name)
      `,
      )
      .eq("tenant_id", tenantId)
      .in("id", unique),
    supabase
      .from("payment_transactions")
      .select("booking_id")
      .in("booking_id", unique)
      .in("status", ["success", "partially_refunded", "refunded"])
      .in("transaction_type", ["charge", "additional_charge"]),
  ]);

  const withGateway = new Set(
    (gatewayRows ?? []).map((r) => String((r as { booking_id?: string }).booking_id ?? "")),
  );

  const rows: RefundListRow[] = [];
  for (const booking of bookings ?? []) {
    const id = String((booking as { id: string }).id);
    if (withGateway.has(id)) continue;

    const { data: payments } = await supabase
      .from("booking_payments")
      .select("id")
      .eq("booking_id", id)
      .in("status", ["completed", "partially_refunded"])
      .limit(1);

    if (!(payments ?? []).length) continue;

    rows.push({
      id: `booking-tender:${id}`,
      booking_id: id,
      transaction_type: "charge",
      amount: 0,
      refund_amount: 0,
      status: "success",
      created_at: (booking as { created_at?: string }).created_at ?? null,
      provider: null,
      metadata: { kind: "booking_tender_only" },
      booking,
      booking_refunds: [],
    } as RefundListRow);
  }

  return rows;
}
