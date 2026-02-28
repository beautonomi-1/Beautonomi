import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

/**
 * GET /api/provider/customers/[id]/profile
 * 
 * Get customer profile data for a provider to view
 * Providers can view customer profiles if they have a booking or conversation with them
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    if (!customerId) {
      return handleApiError(new Error("Customer ID is required"), "Customer ID is required", 400);
    }

    // Verify provider has a relationship with this customer (booking or conversation)
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found", 404);
    }

    // Check if provider has a booking or conversation with this customer
    const { data: hasRelationship } = await supabase
      .from("bookings")
      .select("id")
      .eq("customer_id", customerId)
      .eq("provider_id", providerId)
      .limit(1)
      .maybeSingle();

    if (!hasRelationship) {
      // Check conversations
      const { data: hasConversation } = await supabase
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("provider_id", providerId)
        .limit(1)
        .maybeSingle();

      if (!hasConversation) {
        return handleApiError(
          new Error("No relationship found"),
          "You can only view profiles of customers you have bookings or conversations with",
          403
        );
      }
    }

    // Get customer basic info
    const { data: customer, error: customerError } = await supabase
      .from("users")
      .select("id, full_name, email, avatar_url, phone, created_at, rating_average, review_count")
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      return handleApiError(customerError || new Error("Customer not found"), "Customer not found", 404);
    }

    // Get customer extended profile data
    const { data: profileData, error: _profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", customerId)
      .maybeSingle();

    // Get booking history with this provider
    const { data: bookings, error: _bookingsError } = await supabase
      .from("bookings")
      .select("id, booking_number, status, scheduled_at, total_amount, currency, created_at")
      .eq("customer_id", customerId)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get review history (reviews customer left for this provider)
    const { data: reviews, error: _reviewsError } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at")
      .eq("customer_id", customerId)
      .eq("provider_id", providerId)
      .order("created_at", { ascending: false })
      .limit(5);

    return successResponse({
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email,
        avatar_url: customer.avatar_url,
        phone: customer.phone,
        created_at: customer.created_at,
        rating_average: customer.rating_average,
        review_count: customer.review_count,
      },
      profile: profileData || null,
      bookings: bookings || [],
      reviews: reviews || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch customer profile");
  }
}
