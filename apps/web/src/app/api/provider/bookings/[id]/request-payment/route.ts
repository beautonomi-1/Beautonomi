import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { z } from "zod";
import type { Booking, AdditionalCharge } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";

const requestPaymentSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
});

/**
 * POST /api/provider/bookings/[id]/request-payment
 * 
 * Request additional payment from customer during/after service
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const { id } = await params;
    const body = await request.json();

    const validationResult = requestPaymentSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { description, amount } = validationResult.data;

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

    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (booking as { tenant_id?: string | null }).tenant_id,
      )
    ) {
      return errorResponse(
        "This booking belongs to a different market. Use the provider site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const supabaseAdminReq = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminReq,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const bookingData = booking as any;

    // Check if booking is in progress or completed
    if (!["in_progress", "completed"].includes(bookingData.status)) {
      return errorResponse("Can only request additional payment for in-progress or completed bookings", "INVALID_STATUS", 400);
    }

    // Create additional charge row (real table)
    const { data: chargeRow, error: chargeError } = await (supabase
      .from("additional_charges") as any)
      .insert({
        booking_id: id,
        description,
        amount,
        currency: bookingData.currency || lastResortCurrency,
        status: "pending",
        requested_by: user.id,
        requested_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (chargeError || !chargeRow) {
      throw chargeError || new Error("Failed to create additional charge");
    }

    const newCharge = chargeRow as AdditionalCharge;

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "additional_payment_requested",
        event_data: {
          charge_id: newCharge.id,
          description,
          amount,
        },
        created_by: user.id,
      });
    if (eventError) {
      console.error("Failed to create booking event for additional charge:", eventError);
    }

    // Notify customer using template
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      await sendTemplateNotification(
        "partial_payment_received",
        [bookingData.customer_id],
        {
          partial_amount: `${newCharge.currency} ${Number(newCharge.amount).toFixed(2)}`,
          remaining_balance: `${newCharge.currency} ${Math.max(0, Number(bookingData.total_amount || 0) - Number(bookingData.total_paid || 0) + Number(newCharge.amount)).toFixed(2)}`,
          booking_number: bookingData.booking_number || bookingData.ref_number || "",
          booking_id: id,
          charge_description: newCharge.description || "Additional charge",
        },
        ["push", "email"],
        { appType: "customer" }
      );
    } catch (notifError) {
      console.error("Error sending additional payment request notification:", notifError);
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      booking: updatedBooking as Booking,
      charge: newCharge,
      message: "Additional payment request created successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to request additional payment");
  }
}
