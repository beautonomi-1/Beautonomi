import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { assertProviderUserCanAccessBookingBranch } from "@/lib/provider-booking/booking-branch-access";
import { resolveAdditionalChargeSettlementPlan } from "@/lib/bookings/resolve-additional-charge-settlement";

/**
 * GET /api/provider/bookings/[id]/additional-charges
 *
 * List additional charges for a booking (provider view).
 * Also returns `settlementPlan` — a smart recommended action + available
 * overrides for the provider to choose how to collect each new charge.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, location_id, booking_source, payment_provider, customer_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!booking) return notFoundResponse("Booking not found");

    const supabaseAdminCharges = getSupabaseAdmin();
    const branchAccess = await assertProviderUserCanAccessBookingBranch(
      supabaseAdminCharges,
      user.id,
      user.role,
      providerId,
      (booking as { location_id?: string | null }).location_id ?? null
    );
    if (branchAccess.allowed === false) {
      return errorResponse(branchAccess.message, "FORBIDDEN", 403);
    }

    const { data: charges, error } = await (supabase
      .from("additional_charges") as any)
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Check whether the customer has an active, non-expired saved Paystack card.
    const customerId = (booking as { customer_id?: string | null }).customer_id ?? null;
    let customerHasSavedCard = false;
    if (customerId) {
      const { data: pm } = await (supabaseAdminCharges.from("payment_methods") as any)
        .select("id, expiry_month, expiry_year")
        .eq("user_id", customerId)
        .eq("provider", "paystack")
        .eq("is_active", true)
        .limit(5)
        .maybeSingle();
      // Only count as usable if the card exists and is not expired.
      if (pm) {
        const { isPaymentMethodExpired } = await import("@/lib/payments/payment-method-expiry");
        customerHasSavedCard = !isPaymentMethodExpired(
          (pm as { expiry_month?: number }).expiry_month,
          (pm as { expiry_year?: number }).expiry_year,
        );
      }
    }

    const settlementPlan = resolveAdditionalChargeSettlementPlan({
      bookingSource: (booking as { booking_source?: string | null }).booking_source,
      originalPaymentProvider: (booking as { payment_provider?: string | null }).payment_provider,
      customerHasSavedCard,
    });

    return successResponse({ charges: charges || [], settlementPlan });
  } catch (error) {
    return handleApiError(error, "Failed to fetch additional charges");
  }
}

