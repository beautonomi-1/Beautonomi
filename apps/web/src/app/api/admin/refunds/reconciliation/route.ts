import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSectionAny,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { parseRefundAmount } from "@/lib/admin/booking-refund-context";
import { netPaymentTransactionAmount } from "@/lib/finance/payment-transaction-net";

type StaleCaptureRow = {
  transaction_id: string;
  booking_id: string;
  booking_number: string | null;
  charge_amount: number;
  refund_amount: number;
  expected_refund: number;
  gap: number;
  status: string;
};

type BookingTenderGap = {
  booking_id: string;
  booking_number: string | null;
  total_paid: number;
  total_refunded: number;
  has_gateway_capture: boolean;
};

/**
 * GET /api/admin/refunds/reconciliation
 *
 * Read-only report: stale gateway capture rows and in-person bookings with
 * refunds but no payment_transactions row.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny(
      [ADMIN_SECTION_FINANCE, ADMIN_SECTION_PROVIDERS_OPERATIONS],
      request,
    );

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const limit = Math.min(
      500,
      parseInt(new URL(request.url).searchParams.get("limit") || "200", 10),
    );

    const { data: captures } = await supabase
      .from("payment_transactions")
      .select(
        `
        id,
        booking_id,
        amount,
        refund_amount,
        status,
        transaction_type,
        booking:bookings!inner(
          id,
          booking_number,
          total_refunded,
          tenant_id
        )
      `,
      )
      .eq("booking.tenant_id", tenantId)
      .in("status", ["success", "partially_refunded", "refunded"])
      .in("transaction_type", ["charge", "additional_charge"])
      .order("created_at", { ascending: false })
      .limit(limit);

    const stale: StaleCaptureRow[] = [];
    for (const row of captures ?? []) {
      const booking = (row as { booking?: { total_refunded?: unknown; booking_number?: string } })
        .booking;
      const bookingRefunded = parseRefundAmount(booking?.total_refunded);
      const chargeAmount = netPaymentTransactionAmount(
        row as { amount?: unknown; refund_amount?: unknown },
      );
      const grossAmount = parseRefundAmount((row as { amount?: unknown }).amount);
      const txnRefunded = parseRefundAmount((row as { refund_amount?: unknown }).refund_amount);
      const expected = Math.min(grossAmount, bookingRefunded);
      const gap = Math.round((expected - txnRefunded) * 100) / 100;

      if (gap > 0.01) {
        stale.push({
          transaction_id: String((row as { id: string }).id),
          booking_id: String((row as { booking_id: string }).booking_id),
          booking_number: booking?.booking_number ?? null,
          charge_amount: chargeAmount,
          refund_amount: txnRefunded,
          expected_refund: expected,
          gap,
          status: String((row as { status?: string }).status ?? ""),
        });
      }
    }

    const { data: refundedBookings } = await supabase
      .from("bookings")
      .select("id, booking_number, total_paid, total_refunded")
      .eq("tenant_id", tenantId)
      .gt("total_refunded", 0)
      .order("updated_at", { ascending: false })
      .limit(limit);

    const bookingIds = (refundedBookings ?? []).map((b) => String((b as { id: string }).id));
    const { data: gatewayByBooking } = bookingIds.length
      ? await supabase
          .from("payment_transactions")
          .select("booking_id")
          .in("booking_id", bookingIds)
          .in("transaction_type", ["charge", "additional_charge"])
          .in("status", ["success", "partially_refunded", "refunded"])
      : { data: [] };

    const withGateway = new Set(
      (gatewayByBooking ?? []).map((r) => String((r as { booking_id?: string }).booking_id ?? "")),
    );

    const tenderGaps: BookingTenderGap[] = [];
    for (const b of refundedBookings ?? []) {
      const id = String((b as { id: string }).id);
      if (withGateway.has(id)) continue;
      const { data: payments } = await supabase
        .from("booking_payments")
        .select("id")
        .eq("booking_id", id)
        .in("status", ["completed", "partially_refunded"])
        .limit(1);
      if (!(payments ?? []).length) continue;

      tenderGaps.push({
        booking_id: id,
        booking_number: (b as { booking_number?: string }).booking_number ?? null,
        total_paid: parseRefundAmount((b as { total_paid?: unknown }).total_paid),
        total_refunded: parseRefundAmount((b as { total_refunded?: unknown }).total_refunded),
        has_gateway_capture: false,
      });
    }

    return successResponse({
      stale_captures: stale,
      stale_capture_count: stale.length,
      booking_tender_gaps: tenderGaps,
      booking_tender_gap_count: tenderGaps.length,
      scanned_limit: limit,
    });
  } catch (error) {
    return handleApiError(error, "Failed to build refund reconciliation report");
  }
}
