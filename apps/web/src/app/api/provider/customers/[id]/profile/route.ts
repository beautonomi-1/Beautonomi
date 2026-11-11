import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { NextRequest } from "next/server";
import { hasProviderCustomerRelationship } from "@/lib/provider/client-access";

const PUBLIC_PROFILE_COLUMNS =
  "about, school, work, location, languages, decade_born, favorite_song, obsessed_with, fun_fact, useless_skill, biography_title, spend_time, pets, interests";

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
    const permissionCheck = await requirePermission("view_clients", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);

    if (!customerId) {
      return handleApiError(new Error("Customer ID is required"), "Customer ID is required", 400);
    }

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return handleApiError(new Error("Provider not found"), "Provider not found", 404);
    }

    // RLS hides other users' rows (and conversations/sales for staff) from the
    // provider's session, so both the relationship check and the reads below
    // must use the admin client — reads only happen once the relationship is proven.
    const admin = getSupabaseAdmin();
    const hasRelationship = await hasProviderCustomerRelationship(admin, providerId, customerId);
    if (!hasRelationship) {
      return handleApiError(
        new Error("No relationship found"),
        "You can only view profiles of customers connected to your business",
        403
      );
    }

    const [customerRes, profileRes, bookingsRes, reviewsRes] = await Promise.all([
      admin
        .from("users")
        .select("id, full_name, email, avatar_url, phone, created_at, rating_average, review_count")
        .eq("id", customerId)
        .maybeSingle(),
      admin.from("user_profiles").select(PUBLIC_PROFILE_COLUMNS).eq("user_id", customerId).maybeSingle(),
      admin
        .from("bookings")
        .select("id, booking_number, status, scheduled_at, total_amount, currency, created_at")
        .eq("customer_id", customerId)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("reviews")
        .select("id, rating, comment, created_at")
        .eq("customer_id", customerId)
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const customer = customerRes.data;
    if (customerRes.error || !customer) {
      return handleApiError(customerRes.error || new Error("Customer not found"), "Customer not found", 404);
    }

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
      profile: profileRes.data || null,
      bookings: bookingsRes.data || [],
      reviews: reviewsRes.data || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch customer profile");
  }
}
