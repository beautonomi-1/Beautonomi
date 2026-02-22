import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/bookings/[id]/additional-charges
 * 
 * Get additional charges for a customer's booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer();
    const { id } = await params;

    // Verify booking belongs to customer (or user is provider/admin)
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("id", id)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    // Check access: customer can only see their own bookings
    // Providers/admins can see their provider's bookings
    const isCustomer = user.role === 'customer' && booking.customer_id === user.id;
    const isProvider = ['provider_owner', 'provider_staff'].includes(user.role);
    const isAdmin = user.role === 'superadmin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return notFoundResponse("Booking not found");
    }

    // If provider, verify they own the booking
    if (isProvider && !isAdmin) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", booking.provider_id)
        .single();

      if (!provider) {
        return notFoundResponse("Booking not found");
      }
    }

    // Get additional charges
    const { data: charges, error: chargesError } = await supabase
      .from("additional_charges")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false });

    if (chargesError) {
      throw chargesError;
    }

    return successResponse({ charges: charges || [] });
  } catch (error) {
    return handleApiError(error, "Failed to fetch additional charges");
  }
}
