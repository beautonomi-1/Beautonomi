import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/search
 * 
 * Global search across users, bookings, providers, etc.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const supabase = await getSupabaseServer(request);

    if (!supabase) {
      return handleApiError(new Error("Supabase client not available"), "Failed to search");
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        data: {
          users: [],
          bookings: [],
          providers: [],
        },
        error: null,
      });
    }

    const searchTerm = query.trim().toLowerCase();

    // Search users (by email, phone, or name)
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, phone, full_name, role")
      .or(`email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .limit(5);

    // Search bookings (by booking number or customer/provider info)
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, booking_number, customer_id, provider_id, status, created_at")
      .ilike("booking_number", `%${searchTerm}%`)
      .limit(5);

    // Search providers (by business name, owner name, or email)
    const { data: providers, error: providersError } = await supabase
      .from("providers")
      .select("id, business_name, owner_name, owner_email, status")
      .or(`business_name.ilike.%${searchTerm}%,owner_name.ilike.%${searchTerm}%,owner_email.ilike.%${searchTerm}%`)
      .limit(5);

    if (usersError) {
      console.error("Error searching users:", usersError);
    }
    if (bookingsError) {
      console.error("Error searching bookings:", bookingsError);
    }
    if (providersError) {
      console.error("Error searching providers:", providersError);
    }

    return NextResponse.json({
      data: {
        users: users || [],
        bookings: bookings || [],
        providers: providers || [],
      },
      error: null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to search");
  }
}
