import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import type { Booking } from "@/types/beautonomi";
import { awardPointsForBooking, checkProviderMilestones } from "@/lib/services/provider-gamification";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { syncAppointmentProductOrder } from "@/lib/orders/sync-appointment-product-order";

function resolveLoyaltyBaseAmount(booking: {
  subtotal?: number | null;
  total_amount?: number | null;
  tax_amount?: number | null;
  service_fee_amount?: number | null;
  tip_amount?: number | null;
  travel_fee?: number | null;
  discount_amount?: number | null;
}): number {
  const subtotal = Number(booking.subtotal ?? 0);
  if (subtotal > 0) return subtotal;

  const total = Number(booking.total_amount ?? 0);
  if (total <= 0) return 0;

  const tax = Number(booking.tax_amount ?? 0);
  const serviceFee = Number(booking.service_fee_amount ?? 0);
  const tip = Number(booking.tip_amount ?? 0);
  const travel = Number(booking.travel_fee ?? 0);
  const discount = Number(booking.discount_amount ?? 0);
  return Math.max(0, total - tax - serviceFee - tip - travel + discount);
}

/**
 * POST /api/provider/bookings/[id]/complete-service
 *
 * Mark service as completed. Awards both provider reward points and
 * customer loyalty points (only on completion), and deducts any product
 * stock tied to the booking.
 *
 * Requires `edit_appointments`, matching booking status update permissions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("edit_appointments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Proxy group:UUID ids — complete maps to the group-bookings PATCH endpoint
    if (id.startsWith("group:")) {
      const groupId = id.slice("group:".length);
      const groupUrl = new URL(`/api/provider/group-bookings/${groupId}`, request.url);
      groupUrl.searchParams.set("action", "complete_service");
      return NextResponse.redirect(groupUrl, 307);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const supabaseAdminBranch = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminBranch,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as any;
    const bookingTenantId = (bookingData as { tenant_id?: string | null }).tenant_id ?? null;
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      bookingTenantId ??
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Check if service is in progress — require consistent status + stage
    const validForCompletion =
      bookingData.status === "in_progress" ||
      bookingData.current_stage === "service_started";
    if (!validForCompletion) {
      return errorResponse("Service must be started before completing", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "service_completed",
        event_data: {
          completed_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
    }

    // Update booking with version bump
    const currentVersion = (bookingData as { version?: number }).version || 0;
    const { data: updatedRows, error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        current_stage: "service_completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: currentVersion + 1,
      })
      .eq("id", id)
      .eq("version", currentVersion)
      .select("id");

    if (updateError) {
      throw updateError;
    }
    if (!updatedRows?.length) {
      return errorResponse(
        "Booking was modified by another user. Please refresh and try again.",
        "CONFLICT",
        409
      );
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    // Award provider reward points and customer loyalty points (non-blocking, only on completion)
    if (updatedBooking) {
      awardPointsForBooking(providerId, id).catch(err => 
        console.error('Failed to award provider points for booking:', err)
      );
      checkProviderMilestones(providerId).catch(err => 
        console.error('Failed to check milestones:', err)
      );

      // Award customer loyalty points for completed booking (using loyalty_rules)
      const customerId = (updatedBooking as any).customer_id;
      const loyaltyBaseAmount = resolveLoyaltyBaseAmount(updatedBooking as any);
      if (loyaltyBaseAmount > 0 && customerId) {
        try {
          const supabaseAdmin = await getSupabaseAdmin();
          const { calculateLoyaltyPoints } = await import("@/lib/loyalty/calculate-points");
          const { data: existing } = await supabaseAdmin
            .from("loyalty_point_transactions")
            .select("id")
            .eq("reference_id", id)
            .eq("reference_type", "booking")
            .eq("transaction_type", "earned")
            .maybeSingle();
          if (!existing) {
            const currency = (updatedBooking as any).currency || lastResortCurrency;
            const pointsEarned = await calculateLoyaltyPoints(loyaltyBaseAmount, supabaseAdmin, currency);
            if (pointsEarned > 0) {
              const { error: pointsInsertError } = await supabaseAdmin.from("loyalty_point_transactions").insert({
                user_id: customerId,
                transaction_type: "earned",
                points: pointsEarned,
                description: `Points earned for completed booking ${(updatedBooking as any).booking_number || id}`,
                reference_id: id,
                reference_type: "booking",
                expires_at: null,
              });
              if (pointsInsertError) {
                throw pointsInsertError;
              }
              await supabaseAdmin.from("bookings").update({ loyalty_points_earned: pointsEarned }).eq("id", id);
            }
          }
        } catch (err) {
          console.error('Failed to award customer loyalty points on completion:', err);
        }
      }

      // §Provider-audit 2026-04 (round 2): deduct retail stock for any
      // products attached to this booking. Mirrors the logic in
      // PATCH /api/provider/bookings/[id] so `complete-service` (called
      // from the booking detail "Mark complete" button) and the generic
      // PATCH status flow produce identical inventory effects. Idempotent
      // via the `stock_deducted_at` timestamp (migration 519).
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: pendingProducts } = await supabaseAdmin
          .from("booking_products")
          .select("id, product_id, product_variant_id, quantity")
          .eq("booking_id", id)
          .is("stock_deducted_at", null);
        if (Array.isArray(pendingProducts) && pendingProducts.length > 0) {
          const deductTs = new Date().toISOString();
          for (const row of pendingProducts as Array<{
            id: string;
            product_id: string | null;
            product_variant_id?: string | null;
            quantity: number | null;
          }>) {
            if (!row.product_id || !row.quantity || row.quantity <= 0) continue;
            const { error: decErr } = row.product_variant_id
              ? await (supabaseAdmin.rpc as any)("decrement_product_variant_stock", {
                p_variant_id: row.product_variant_id,
                p_quantity: row.quantity,
              })
              : await supabaseAdmin.rpc(
                "decrement_product_stock",
                {
                  p_product_id: row.product_id,
                  p_quantity: row.quantity,
                },
              );
            if (decErr) {
              console.error(
                `[complete-service] decrement_product_stock failed for booking ${id}, row ${row.id}:`,
                decErr,
              );
              continue;
            }
            await supabaseAdmin
              .from("booking_products")
              .update({ stock_deducted_at: deductTs })
              .eq("id", row.id);
          }
        }
      } catch (stockErr) {
        console.error("[complete-service] failed to deduct retail stock:", stockErr);
      }

      try {
        await syncAppointmentProductOrder(getSupabaseAdmin() as never, id);
      } catch (orderSyncError) {
        console.error(`[complete-service] failed to sync appointment product order for ${id}:`, orderSyncError);
      }

      // §Release-audit 2026-04: notify the customer that their appointment
      // is complete, mirroring the cancel / reschedule / confirm paths.
      try {
        const { sendServiceCompletedNotification } = await import(
          "@/lib/bookings/notifications"
        );
        await sendServiceCompletedNotification(id);
      } catch (notifyErr) {
        console.error("[complete-service] notification failed:", notifyErr);
      }
    }

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Service completed successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to complete service");
  }
}
