import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { isInPersonCollected, isPlatformCollected } from "@/lib/bookings/payment-collected-classifier";

const LIMIT = 200;

type PaymentRow = {
  booking_id: string;
  amount: number | string | null;
  status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
};

/**
 * GET /api/admin/finance/refund-anomalies
 * Read-only lists:
 *  - wallet_refund_on_in_person: store-credit refunds where the booking's in-person share exceeds its online share
 *  - group_yoco_mark_paid_without_ref: group mark_paid rows recorded as yoco with no Yoco transaction id
 *  - terminal_capture_on_paid_booking: late terminal captures on already-paid bookings
 *  - refund_issued_by_staff: staff refund audit trail
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const admin = getSupabaseAdmin();

    const { data: walletRefunds, error: walletRefundsError } = await admin
      .from("booking_refunds")
      .select("id, booking_id, amount, refund_method, status, created_at, created_by")
      .in("refund_method", ["store_credit", "wallet"])
      .in("status", ["completed", "pending"])
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (walletRefundsError) throw walletRefundsError;

    const refundBookingIds = [...new Set((walletRefunds ?? []).map((r) => String(r.booking_id)))];
    const sharesByBooking = new Map<string, { online: number; inPerson: number }>();
    if (refundBookingIds.length > 0) {
      const { data: payments, error: paymentsError } = await admin
        .from("booking_payments")
        .select("booking_id, amount, status, payment_method, payment_provider")
        .in("booking_id", refundBookingIds)
        .in("status", ["completed", "partially_refunded"]);
      if (paymentsError) throw paymentsError;
      for (const p of (payments ?? []) as PaymentRow[]) {
        const key = String(p.booking_id);
        const share = sharesByBooking.get(key) ?? { online: 0, inPerson: 0 };
        const amount = Number(p.amount ?? 0);
        if (isPlatformCollected(p)) share.online += amount;
        else if (isInPersonCollected(p)) share.inPerson += amount;
        sharesByBooking.set(key, share);
      }
    }
    const walletRefundOnInPerson = (walletRefunds ?? [])
      .map((r) => {
        const share = sharesByBooking.get(String(r.booking_id)) ?? { online: 0, inPerson: 0 };
        return {
          ...r,
          online_collected: Math.round(share.online * 100) / 100,
          in_person_collected: Math.round(share.inPerson * 100) / 100,
        };
      })
      .filter((r) => r.in_person_collected > r.online_collected + 0.01);

    const { data: groupYoco, error: groupYocoError } = await admin
      .from("booking_payments")
      .select(
        "id, booking_id, amount, payment_method, payment_provider, payment_provider_id, notes, created_at, created_by, bookings!inner(group_booking_id, provider_id)",
      )
      .eq("payment_provider", "yoco")
      .is("payment_provider_id", null)
      .not("bookings.group_booking_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (groupYocoError) throw groupYocoError;

    const { data: terminalOnPaid } = await admin
      .from("booking_events")
      .select("id, booking_id, event_data, created_at")
      .eq("event_type", "terminal_capture_on_paid_booking")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    const { data: staffRefunds } = await admin
      .from("booking_events")
      .select("id, booking_id, event_data, created_at, created_by")
      .eq("event_type", "refund_issued_by_staff")
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    return successResponse({
      wallet_refund_on_in_person: walletRefundOnInPerson,
      group_yoco_mark_paid_without_ref: groupYoco ?? [],
      terminal_capture_on_paid_booking: terminalOnPaid ?? [],
      refund_issued_by_staff: staffRefunds ?? [],
      limit: LIMIT,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load refund anomalies");
  }
}
