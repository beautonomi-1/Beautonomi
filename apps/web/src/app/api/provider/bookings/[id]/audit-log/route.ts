import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";

export type BookingAuditLogRow = {
  id: string;
  booking_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

/**
 * GET /api/provider/bookings/[id]/audit-log
 *
 * Returns a merged timeline: `booking_audit_log` rows plus synthetic milestones
 * (created, payments, completion/cancel) so the mobile "History" sheet is useful
 * even when the DB trigger only logged status changes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return successResponse([]);
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, location_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) {
      return successResponse([]);
    }

    const supabaseAdminAudit = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminAudit,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null,
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const { data: bookingRow, error: bookingErr } = await supabaseAdminAudit
      .from("bookings")
      .select("id, created_at, completed_at, cancelled_at, cancellation_reason, status")
      .eq("id", id)
      .single();

    if (bookingErr || !bookingRow) {
      return successResponse([]);
    }

    const { data: auditLogs, error } = await supabaseAdminAudit
      .from("booking_audit_log")
      .select(
        `
        *,
        created_by_user:users!booking_audit_log_created_by_fkey(full_name, email)
      `,
      )
      .eq("booking_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching audit log:", error);
      return successResponse([]);
    }

    const transformedLogs: BookingAuditLogRow[] = (auditLogs || []).map((log: Record<string, unknown>) => {
      const u = log.created_by_user as { full_name?: string | null; email?: string | null } | undefined;
      return {
        id: String(log.id),
        booking_id: String(log.booking_id),
        event_type: String(log.event_type),
        event_data: (log.event_data as Record<string, unknown> | null) ?? null,
        created_by: String(log.created_by ?? ""),
        created_by_name: u?.full_name || u?.email || "System",
        created_at: String(log.created_at),
      };
    });

    const paymentIdsFromAudit = new Set(
      transformedLogs
        .filter((e) => e.event_type === "payment_received")
        .map((e) => {
          const pid = e.event_data?.payment_id;
          return typeof pid === "string" ? pid : null;
        })
        .filter((x): x is string => Boolean(x)),
    );

    const synthetic: BookingAuditLogRow[] = [];
    const br = bookingRow as Record<string, unknown>;
    const hasType = (t: string) => transformedLogs.some((e) => e.event_type === t);

    if (!hasType("created") && br.created_at) {
      synthetic.push({
        id: `syn-created-${id}`,
        booking_id: id,
        event_type: "created",
        event_data: { source: "booking_row" },
        created_by: "",
        created_by_name: "System",
        created_at: String(br.created_at),
      });
    }

    if (br.completed_at && !hasType("service_completed")) {
      synthetic.push({
        id: `syn-completed-${id}`,
        booking_id: id,
        event_type: "service_completed",
        event_data: { source: "booking_row", previous_status: br.status },
        created_by: "",
        created_by_name: "System",
        created_at: String(br.completed_at),
      });
    }

    if (br.cancelled_at && !hasType("cancelled")) {
      synthetic.push({
        id: `syn-cancelled-${id}`,
        booking_id: id,
        event_type: "cancelled",
        event_data: {
          source: "booking_row",
          reason: br.cancellation_reason ?? null,
        },
        created_by: "",
        created_by_name: "System",
        created_at: String(br.cancelled_at),
      });
    }

    const { data: payments } = await supabaseAdminAudit
      .from("booking_payments")
      .select("id, amount, payment_method, status, created_at, created_by")
      .eq("booking_id", id)
      .in("status", ["completed", "succeeded", "paid"]);

    for (const p of payments ?? []) {
      const pr = p as Record<string, unknown>;
      const payId = String(pr.id ?? "");
      if (payId && paymentIdsFromAudit.has(payId)) continue;
      synthetic.push({
        id: `syn-payment-${payId}`,
        booking_id: id,
        event_type: "payment_received",
        event_data: {
          payment_id: payId || undefined,
          amount: pr.amount,
          payment_method: pr.payment_method,
          status: pr.status,
        },
        created_by: String(pr.created_by ?? ""),
        created_by_name: "Payment",
        created_at: String(pr.created_at),
      });
    }

    const merged = [...transformedLogs, ...synthetic].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const seenIds = new Set<string>();
    const deduped: BookingAuditLogRow[] = [];
    for (const row of merged) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      deduped.push(row);
    }

    return successResponse(deduped);
  } catch (error) {
    return handleApiError(error, "Failed to fetch audit log");
  }
}
