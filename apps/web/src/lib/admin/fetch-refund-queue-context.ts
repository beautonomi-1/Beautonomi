import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRefundCoverage } from "@/lib/admin/booking-refund-coverage";
import { loadBookingRefundCoverageBatch } from "@/lib/admin/load-booking-refund-coverage-batch";
import { fetchAdditionalChargesByIds } from "@/lib/admin/fetch-additional-charges";
import type { RefundQueueContext } from "@/lib/admin/refund-queue-rows";
import type { BookingPaymentTender } from "@/lib/admin/refund-tender-labels";
import type { RefundListRow } from "@/lib/admin/refund-list-normalize";

function bookingIdFromRow(row: RefundListRow): string | null {
  const b = row.booking as { id?: string } | null | undefined;
  return row.booking_id ?? b?.id ?? null;
}

export async function fetchRefundQueueContext(
  supabase: SupabaseClient,
  tenantId: string,
  bookingIds: string[],
): Promise<RefundQueueContext> {
  const uniqueBookingIds = [...new Set(bookingIds.filter(Boolean))];

  const [disputesRes, ticketsRes, coverageByBookingId, paymentsRes] = await Promise.all([
    supabase
      .from("booking_disputes")
      .select("booking_id, bookings!inner(tenant_id)")
      .eq("status", "open")
      .eq("bookings.tenant_id", tenantId)
      .in("booking_id", uniqueBookingIds.length ? uniqueBookingIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("support_tickets")
      .select("support_context_id, status")
      .eq("support_context_type", "booking")
      .in("category", ["payment_refund", "booking_reschedule_cancel"])
      .in("status", ["open", "pending", "in_progress", "new"])
      .in(
        "support_context_id",
        uniqueBookingIds.length ? uniqueBookingIds : ["00000000-0000-0000-0000-000000000000"],
      ),
    loadBookingRefundCoverageBatch(supabase, uniqueBookingIds),
    uniqueBookingIds.length
      ? supabase
          .from("booking_payments")
          .select("booking_id, amount, payment_method, payment_provider, status")
          .in("booking_id", uniqueBookingIds)
          .in("status", ["completed", "partially_refunded"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const disputesByBookingId = new Set<string>();
  for (const d of disputesRes.data ?? []) {
    const bid = (d as { booking_id?: string }).booking_id;
    if (bid) disputesByBookingId.add(String(bid));
  }

  const ticketsByBookingId = new Set<string>();
  for (const t of ticketsRes.data ?? []) {
    const bid = (t as { support_context_id?: string }).support_context_id;
    if (bid) ticketsByBookingId.add(String(bid));
  }

  const bookingPaymentsByBookingId = new Map<string, BookingPaymentTender[]>();
  for (const p of paymentsRes.data ?? []) {
    const bid = String((p as { booking_id?: string }).booking_id ?? "");
    if (!bid) continue;
    const list = bookingPaymentsByBookingId.get(bid) ?? [];
    list.push(p as BookingPaymentTender);
    bookingPaymentsByBookingId.set(bid, list);
  }

  return {
    disputesByBookingId,
    ticketsByBookingId,
    coverageByBookingId: coverageByBookingId as Map<string, BookingRefundCoverage>,
    additionalChargesById: new Map(),
    bookingPaymentsByBookingId,
  };
}

export function collectAdditionalChargeIds(rows: RefundListRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const meta = row.metadata;
    if (meta && typeof meta === "object") {
      const id = (meta as { additional_charge_id?: string }).additional_charge_id;
      if (id) ids.push(String(id));
    }
  }
  return ids;
}

export async function attachAdditionalChargesToContext(
  supabase: SupabaseClient,
  ctx: RefundQueueContext,
  chargeIds: string[],
): Promise<void> {
  const map = await fetchAdditionalChargesByIds(supabase, chargeIds);
  for (const [id, row] of map) {
    ctx.additionalChargesById.set(id, row);
  }
}
