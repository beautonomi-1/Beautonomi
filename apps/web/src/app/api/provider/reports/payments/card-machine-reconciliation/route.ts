import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/provider/reports/payments/card-machine-reconciliation
 * Combined Yoco + PayCloud exception rows for ops reconciliation.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });
    if (!providerId) {
      return successResponse({
        yoco: [],
        paycloud: [],
        awaiting_refunds: [],
        summary: { total: 0, exceptions: 0, awaiting_refunds: 0, awaiting_refund_total: 0 },
      });
    }
    const permissionCheck = await requireProviderReportsAccess(request, { reportType: "payments" });
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const admin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let yocoQ = admin
      .from("provider_yoco_payments")
      .select("id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at")
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (from) yocoQ = yocoQ.gte("created_at", from);
    if (to) yocoQ = yocoQ.lte("created_at", to);
    const { data: yocoRows } = await yocoQ;

    let pcQ = admin
      .from("provider_paycloud_payments")
      .select(
        "id, merchant_order_no, amount, expected_amount, amount_match_status, status, created_at",
      )
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (from) pcQ = pcQ.gte("created_at", from);
    if (to) pcQ = pcQ.lte("created_at", to);
    const { data: pcRows } = await pcQ;

    const paycloudExceptions = (pcRows ?? []).filter(
      (p: { amount_match_status?: string | null }) =>
        p.amount_match_status &&
        p.amount_match_status !== "exact" &&
        p.amount_match_status !== "pending",
    );

    const yocoPending = (yocoRows ?? []).filter(
      (p: { status?: string }) => p.status === "pending",
    );

    // Outstanding machine refunds are owed regardless of the date window.
    const { data: awaitingRows } = await admin
      .from("booking_refunds")
      .select(
        "id, booking_id, amount, reason, machine_refund_provider, awaiting_machine_since, created_at, booking:bookings!inner(provider_id, booking_number, ref_number)",
      )
      .eq("status", "pending")
      .not("machine_refund_provider", "is", null)
      .eq("booking.provider_id", providerId)
      .order("awaiting_machine_since", { ascending: true })
      .limit(200);
    const awaitingRefunds = (awaitingRows ?? []).map((r) => {
      const row = r as {
        id: string;
        booking_id: string;
        amount: number | string;
        reason: string | null;
        machine_refund_provider: string;
        awaiting_machine_since: string | null;
        created_at: string | null;
        booking?:
          | { booking_number?: string | null; ref_number?: string | null }
          | Array<{ booking_number?: string | null; ref_number?: string | null }>
          | null;
      };
      const booking = Array.isArray(row.booking) ? row.booking[0] : row.booking;
      return {
        id: row.id,
        booking_id: row.booking_id,
        booking_ref: booking?.ref_number || booking?.booking_number || null,
        amount: Number(row.amount ?? 0),
        reason: row.reason,
        provider: row.machine_refund_provider,
        since: row.awaiting_machine_since ?? row.created_at,
      };
    });
    const awaitingRefundTotal =
      Math.round(awaitingRefunds.reduce((s, r) => s + r.amount, 0) * 100) / 100;

    return successResponse({
      yoco: yocoRows ?? [],
      paycloud: pcRows ?? [],
      awaiting_refunds: awaitingRefunds,
      summary: {
        total: (yocoRows?.length ?? 0) + (pcRows?.length ?? 0),
        exceptions: paycloudExceptions.length + yocoPending.length + awaitingRefunds.length,
        yoco_pending: yocoPending.length,
        paycloud_amount_mismatch: paycloudExceptions.length,
        awaiting_refunds: awaitingRefunds.length,
        awaiting_refund_total: awaitingRefundTotal,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
