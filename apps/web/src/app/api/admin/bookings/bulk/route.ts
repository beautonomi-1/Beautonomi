import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getBookingsAdminClient } from "@/lib/bookings/bookings-admin-write";
import { requireAdminSection, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { z } from "zod";

const bulkActionSchema = z.object({
  booking_ids: z.array(z.string().uuid()).min(1, "At least one booking ID is required"),
  action: z.enum(["cancel", "complete", "export"]),
  reason: z.string().optional().nullable(),
});

/**
 * POST /api/admin/bookings/bulk
 * 
 * Perform bulk actions on bookings
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    // Validate request body
    const validationResult = bulkActionSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const { booking_ids, action, reason } = validationResult.data;

    const tenantId = await resolveAdminApiTenantId(request);
    const { data: tenantRows, error: tenantCheckError } = await supabase
      .from("bookings")
      .select("id")
      .in("id", booking_ids)
      .eq("tenant_id", tenantId);

    if (tenantCheckError) {
      throw tenantCheckError;
    }
    if (!tenantRows || tenantRows.length !== booking_ids.length) {
      return errorResponse(
        "One or more bookings are not in the current market",
        "TENANT_MISMATCH",
        403
      );
    }

    let updateData: Record<string, unknown> = {};
    const results = { success: 0, failed: 0, errors: [] as string[] };

    switch (action) {
      case "cancel":
        updateData = {};
        break;
      case "complete":
        updateData = { status: "completed" };
        break;
      case "export":
        // Export is handled separately, just return success
        return successResponse({
          success: true,
          message: "Export functionality should use /api/admin/export/bookings",
        });
    }

    const bookingsAdmin = getBookingsAdminClient();
    if (action !== "cancel") {
      const { error: updateError } = await bookingsAdmin
        .from("bookings")
        .update(updateData)
        .in("id", booking_ids)
        .eq("tenant_id", tenantId);

      if (updateError) {
        throw updateError;
      }
    }

    results.success = booking_ids.length;

    // Log audit trail
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: `admin.bookings.bulk.${action}`,
      entity_type: "booking",
      entity_id: booking_ids.join(","),
      metadata: { booking_ids, action, reason, count: booking_ids.length },
    });

    if (action === "cancel") {
      try {
        const adminClient = getBookingsAdminClient();
        const { loadCancellationOutcomeForBooking } = await import(
          "@/lib/bookings/load-cancellation-outcome"
        );
        const { settleParamsFromCancellationOutcome } = await import(
          "@/lib/bookings/cancellation-outcome-bridge"
        );
        const { settleBookingCancellation } = await import(
          "@/lib/bookings/settle-booking-cancellation"
        );
        const { describeRefundFromOutcome } = await import("@/lib/bookings/cancellation-outcome-bridge");
        const { notifyBookingCancelled } = await import("@/lib/notifications/notification-service");
        const { customerBookingChannels } = await import("@/lib/notifications/customer-booking-channels");
        const channels = await customerBookingChannels(tenantId);
        const now = new Date().toISOString();
        results.success = 0;
        for (const bid of booking_ids) {
          const { data: finRow } = await adminClient
            .from("bookings")
            .select(
              "id, status, provider_id, customer_id, booking_number, tenant_id, subtotal, discount_amount, tax_amount, service_fee_amount, travel_fee, tip_amount, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, currency, loyalty_points_used, loyalty_points_redeemed, loyalty_points_earned",
            )
            .eq("id", bid)
            .eq("tenant_id", tenantId)
            .maybeSingle();
          const currentStatus = String(finRow?.status ?? "");
          if (!finRow || ["cancelled", "completed", "no_show"].includes(currentStatus)) {
            results.failed += 1;
            results.errors.push(`${bid}: skipped (status ${currentStatus || "unknown"})`);
            continue;
          }
          const { outcome } = await loadCancellationOutcomeForBooking(adminClient, bid, "admin");
          if (!outcome || !outcome.allowed) {
            results.failed += 1;
            results.errors.push(`${bid}: ${outcome?.blockReason ?? "could not load booking"}`);
            continue;
          }
          const { error: cancelErr } = await adminClient
            .from("bookings")
            .update({
              status: "cancelled",
              cancelled_at: now,
              cancelled_by: user.id,
              cancellation_reason: reason ?? "Bulk cancelled by admin",
              cancellation_fee: outcome.feeRetained,
              updated_at: now,
            })
            .eq("id", bid)
            .eq("tenant_id", tenantId)
            .neq("status", "cancelled");
          if (cancelErr) {
            results.failed += 1;
            results.errors.push(`${bid}: ${cancelErr.message}`);
            continue;
          }
          results.success += 1;

          const grossTotal = Number(finRow.total_amount ?? 0);
          const currency = (finRow.currency as string) || "ZAR";
          let walletRefund = outcome.walletRefund;
          try {
            const { status: _status, ...financial } = finRow;
            const settlement = await settleBookingCancellation(
              settleParamsFromCancellationOutcome(outcome, "admin", {
                booking: { ...financial, total_amount: grossTotal },
                currency,
                refundBookingTotal: grossTotal,
              }),
            );
            walletRefund = settlement.walletRefundAmount;
          } catch (settleErr) {
            console.error("[admin bulk cancel] settlement failed for", bid, settleErr);
          }

          try {
            await notifyBookingCancelled(
              bid,
              "system",
              describeRefundFromOutcome({ ...outcome, walletRefund }, grossTotal, currency),
              channels,
              {
                cancellationReason: reason ?? null,
                feeRetained: outcome.feeRetained,
                walletRefund,
                currency,
              },
            );
          } catch (notifyErr) {
            console.error("[admin bulk cancel] notification failed for", bid, notifyErr);
          }
        }
        const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
        await Promise.allSettled(
          booking_ids.map((bid: string) => matchWaitlistOnCancellation(supabase, bid))
        );
      } catch (waitlistErr) {
        console.error("[admin bulk cancel] waitlist matching failed:", waitlistErr);
      }
    }

    return successResponse({
      success: true,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk action");
  }
}
