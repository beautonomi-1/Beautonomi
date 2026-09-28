import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  getProviderBookingStatusTransitionBlockReason,
  isValidProviderBookingStatusTransition,
} from "@/lib/bookings/booking-status-transitions";

/** Booking row shape from bulk select (id, status, version, customer_id, loyalty_points_earned, booking_number; subtotal/currency optional if expanded) */
type BulkBookingRow = {
  id: string;
  status?: string;
  payment_status?: string | null;
  version?: number;
  customer_id?: string;
  loyalty_points_earned?: number;
  booking_number?: string;
  subtotal?: number;
  currency?: string;
};

/**
 * POST /api/provider/bookings/bulk
 * 
 * Perform bulk operations on multiple bookings
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const body = await request.json();
    const { action, booking_ids } = body;

    if (!action || !Array.isArray(booking_ids) || booking_ids.length === 0) {
      return errorResponse("action and booking_ids are required", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const { data: provRow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId = (provRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const tenantRegion = providerTenantId ? await getTenantRegionConfig(providerTenantId) : null;
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Verify all bookings belong to provider
    const { data: bookings, error: checkError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, payment_status, version, customer_id, loyalty_points_earned, booking_number, subtotal, currency")
      .eq("provider_id", providerId)
      .in("id", booking_ids);

    if (checkError || !bookings || bookings.length !== booking_ids.length) {
      return errorResponse("Some bookings not found or don't belong to provider", "NOT_FOUND", 404);
    }

    // Determine new status based on action
    const statusMap: Record<string, string> = {
      confirm: "confirmed",
      cancel: "cancelled",
      complete: "completed",
      no_show: "no_show",
      delete: "deleted",
    };

    const newStatus = statusMap[action.toLowerCase()];
    if (!newStatus && action.toLowerCase() !== "delete") {
      return errorResponse(`Invalid action: ${action}`, "VALIDATION_ERROR", 400);
    }

    const results = {
      success: [] as string[],
      failed: [] as Array<{ id: string; reason: string }>,
    };

    for (const booking of bookings) {
      const row = booking as BulkBookingRow;
      try {
        const targetStatus = action.toLowerCase() === "delete" ? "cancelled" : newStatus;
        if (!isValidProviderBookingStatusTransition(row.status ?? "", targetStatus)) {
          results.failed.push({
            id: booking.id,
            reason: getProviderBookingStatusTransitionBlockReason(row.status ?? "unknown", targetStatus, {
              payment_status: row.payment_status,
            }),
          });
          continue;
        }

        if (action.toLowerCase() === "delete") {
          // Soft delete by updating status
          const { error: deleteError } = await supabaseAdmin
            .from("bookings")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", booking.id);

          if (deleteError) {
            results.failed.push({ id: booking.id, reason: deleteError.message });
            continue;
          }
          const deleteCustomerId = row.customer_id;
          if (deleteCustomerId) {
            try {
              const { refundRedeemedLoyaltyPoints } = await import(
                "@/lib/loyalty/refund-redeemed-points"
              );
              await refundRedeemedLoyaltyPoints(supabaseAdmin, {
                bookingId: booking.id,
                customerId: deleteCustomerId,
                reason: "provider_bulk_delete",
              });
            } catch (loyaltyRestoreErr) {
              console.error(`Failed to restore loyalty for booking ${booking.id}:`, loyaltyRestoreErr);
            }
            try {
              const { clawBackEarnedLoyaltyForBooking } = await import(
                "@/lib/loyalty/claw-back-earned-for-booking"
              );
              await clawBackEarnedLoyaltyForBooking(supabaseAdmin, {
                bookingId: booking.id,
                customerId: deleteCustomerId,
                bookingNumber: row.booking_number ?? booking.id,
              });
            } catch (loyaltyError) {
              console.error(`Failed to reverse loyalty points for booking ${booking.id}:`, loyaltyError);
            }
          }
        } else {
          const updateData: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (newStatus === "completed") {
            updateData.completed_at = new Date().toISOString();
          } else if (newStatus === "cancelled") {
            updateData.cancelled_at = new Date().toISOString();
          }

          const currentVersion = row.version ?? 0;
          updateData.version = currentVersion + 1;

          const { data: updatedRows, error: updateError } = await supabaseAdmin
            .from("bookings")
            .update(updateData)
            .eq("id", booking.id)
            .eq("version", currentVersion)
            .select("id");

          if (updateError) {
            results.failed.push({ id: booking.id, reason: updateError.message });
            continue;
          }
          if (!updatedRows || updatedRows.length === 0) {
            results.failed.push({ id: booking.id, reason: "Booking was modified concurrently" });
            continue;
          }

          const customerId = row.customer_id;
          if (newStatus === "cancelled" && customerId) {
            try {
              const { refundRedeemedLoyaltyPoints } = await import(
                "@/lib/loyalty/refund-redeemed-points"
              );
              await refundRedeemedLoyaltyPoints(supabaseAdmin, {
                bookingId: booking.id,
                customerId,
                reason: "provider_bulk_cancel",
              });
            } catch (loyaltyRestoreErr) {
              console.error(`Failed to restore loyalty for booking ${booking.id}:`, loyaltyRestoreErr);
            }
            try {
              const { clawBackEarnedLoyaltyForBooking } = await import(
                "@/lib/loyalty/claw-back-earned-for-booking"
              );
              await clawBackEarnedLoyaltyForBooking(supabaseAdmin, {
                bookingId: booking.id,
                customerId,
                bookingNumber: row.booking_number ?? booking.id,
              });
            } catch (loyaltyError) {
              console.error(`Failed to reverse loyalty points for booking ${booking.id}:`, loyaltyError);
            }
          }
        }

        // Create audit log entry
        try {
          const { data: userData } = await supabase
            .from("users")
            .select("full_name, email")
            .eq("id", user.id)
            .single();

          await supabaseAdmin
            .from("booking_audit_log")
            .insert({
              booking_id: booking.id,
              event_type: action.toLowerCase() === "delete" ? "deleted" : "status_changed",
              event_data: {
                previous_status: row.status,
                new_status: action.toLowerCase() === "delete" ? "cancelled" : newStatus,
                field: "status",
                old_value: row.status,
                new_value: action.toLowerCase() === "delete" ? "cancelled" : newStatus,
                bulk_operation: true,
                total_affected: booking_ids.length,
              },
              created_by: user.id,
              created_by_name: userData?.full_name || userData?.email || "System",
            });
        } catch (auditError) {
          // Log but don't fail the operation
          console.error("Failed to create audit log entry:", auditError);
        }

        // Notify waitlist when a slot is freed by cancellation
        const effectiveStatus = action.toLowerCase() === "delete" ? "cancelled" : newStatus;
        if (effectiveStatus === "cancelled") {
          try {
            const { matchWaitlistOnCancellation } = await import("@/lib/waitlist/matching");
            await matchWaitlistOnCancellation(supabaseAdmin, booking.id);
          } catch (waitlistErr) {
            console.error(`[provider bulk cancel] waitlist matching failed for ${booking.id}:`, waitlistErr);
          }
        }

        results.success.push(booking.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.failed.push({ id: booking.id, reason: message });
      }
    }

    return successResponse({
      success_count: results.success.length,
      failed_count: results.failed.length,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk operation");
  }
}
