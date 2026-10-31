import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { autoFinalizeExpiredCashRefunds } from "@/lib/bookings/cash-refund-confirmation";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "auto-finalize-cash-refunds";
export const maxDuration = 60;

/**
 * GET /api/cron/auto-finalize-cash-refunds
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }

  return runLockedCronRoute(JOB_NAME, async () => {
    const supabaseAdmin = getSupabaseAdmin();
    const { finalized, cancellationObligationBookingIds } =
      await autoFinalizeExpiredCashRefunds(supabaseAdmin);
    if (cancellationObligationBookingIds.length > 0) {
      const { notifyFinanceStaff } = await import(
        "@/lib/notifications/notify-finance-staff"
      );
      for (const bookingId of cancellationObligationBookingIds) {
        const { data: booking } = await supabaseAdmin
          .from("bookings")
          .select("booking_number, tenant_id")
          .eq("id", bookingId)
          .maybeSingle();
        await notifyFinanceStaff({
          tenantId: String((booking as { tenant_id?: string })?.tenant_id ?? ""),
          title: "In-person refund auto-confirmed",
          message: `Booking ${(booking as { booking_number?: string })?.booking_number ?? bookingId}: 48-hour cash confirmation window closed without customer action.`,
          link: "/admin/refunds?status=needs_action",
          dedupeKey: `cash_auto_finalize:${bookingId}`,
          data: { booking_id: bookingId },
        });
      }
    }
    return NextResponse.json({ ok: true, finalized });
  });
}
