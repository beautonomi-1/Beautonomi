import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveProviderStaffRowId } from "@/lib/provider/resolve-provider-staff-id";
import { reassignStaffEarningsLines } from "@/lib/payroll/reassign-staff-earnings-lines";
import { notifyStaffUser } from "@/lib/notifications/notify-staff-event";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

const bodySchema = z.object({
  booking_id: z.string().uuid(),
  /** Optional: move only this line item's earnings; omit to move every line on the booking. */
  booking_service_id: z.string().uuid().optional().nullable(),
  from_staff_id: z.string().uuid(),
  to_staff_id: z.string().uuid(),
  reason: z.string().trim().max(200).optional().nullable(),
});

/**
 * POST /api/provider/staff/earnings/reassign
 * Reverses staff_earnings_lines already posted to `from_staff_id` for a booking
 * (kind = 'reversal', negative amount) and posts equivalent lines to
 * `to_staff_id`. Idempotent — re-running does not duplicate rows.
 * Requires manage_team or manage_finance.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const perm = await requireAnyPermission(["manage_team", "manage_finance"], request);
    if (!perm.authorized) return perm.response;

    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, body.error.issues);
    }
    const input = body.data;
    if (input.from_staff_id === input.to_staff_id) {
      return errorResponse("from_staff_id and to_staff_id must differ", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(user.id, admin);
    if (!providerId) return notFoundResponse("Provider not found");

    const fromStaffId = await resolveProviderStaffRowId(admin, providerId, input.from_staff_id);
    const toStaffId = await resolveProviderStaffRowId(admin, providerId, input.to_staff_id);
    if (!fromStaffId) return notFoundResponse("Source staff member not found");
    if (!toStaffId) return notFoundResponse("Target staff member not found");

    const { data: target } = await admin
      .from("provider_staff")
      .select("id, is_active, deleted_at")
      .eq("id", toStaffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!target || target.is_active === false || target.deleted_at) {
      return errorResponse("Target staff member is not active", "STAFF_INACTIVE", 409);
    }

    const { data: booking } = await admin
      .from("bookings")
      .select("id, provider_id, scheduled_start, booking_number")
      .eq("id", input.booking_id)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!booking) return notFoundResponse("Booking not found");

    const result = await reassignStaffEarningsLines(admin, {
      providerId,
      bookingId: input.booking_id,
      bookingServiceId: input.booking_service_id ?? null,
      fromStaffId,
      toStaffId,
      actorUserId: user.id,
      reason: input.reason ?? null,
    });

    if (result.created > 0) {
      const when = booking.scheduled_start ? new Date(booking.scheduled_start as string).toLocaleDateString("en-ZA") : "";
      void notifyStaffUser(toStaffId, "staff_booking_reassigned", {
        title: "Appointment reassigned",
        message: `Booking ${booking.booking_number ?? ""}${when ? ` on ${when}` : ""} and its earnings were reassigned to you.`,
        url: `/provider/bookings/${input.booking_id}`,
        metadata: { booking_id: input.booking_id, direction: "to you", net_moved: result.netMoved },
      }).catch(() => undefined);
      void notifyStaffUser(fromStaffId, "staff_booking_reassigned", {
        title: "Appointment reassigned",
        message: `Booking ${booking.booking_number ?? ""}${when ? ` on ${when}` : ""} and its earnings were reassigned to another team member.`,
        url: `/provider/bookings/${input.booking_id}`,
        metadata: { booking_id: input.booking_id, direction: "away from you", net_moved: -result.netMoved },
      }).catch(() => undefined);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? null,
      action: "staff.earnings_reassigned",
      entity_type: "booking",
      entity_id: input.booking_id,
      module: "staff",
      risk_level: "medium",
      retention_tier: "financial",
      before_json: { staff_id: fromStaffId },
      after_json: { staff_id: toStaffId },
      metadata: {
        provider_id: providerId,
        from_staff_id: fromStaffId,
        to_staff_id: toStaffId,
        booking_service_id: input.booking_service_id ?? null,
        ...result,
      },
      ...extractRequestMeta(request),
    }).catch(() => undefined);

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to reassign staff earnings");
  }
}
