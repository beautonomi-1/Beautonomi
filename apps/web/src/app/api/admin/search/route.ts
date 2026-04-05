import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { collectTenantScopedUserIds } from "@/lib/tenant/admin-tenant-scope";

/**
 * GET /api/admin/search
 * 
 * Global search across users, bookings, providers, etc.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
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
    const tenantId = await resolveAdminApiTenantId(request);
    const scopedUserIds = await collectTenantScopedUserIds(supabase, tenantId);
    const userScopeOr =
      scopedUserIds.length > 0
        ? `preferred_home_tenant_id.eq.${tenantId},id.in.(${scopedUserIds.join(",")})`
        : `preferred_home_tenant_id.eq.${tenantId}`;

    // Search users (by email, phone, or name) — scoped to tenant
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, phone, full_name, role")
      .or(`email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .or(userScopeOr)
      .limit(5);

    // Search bookings (by booking number or customer/provider info)
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, booking_number, customer_id, provider_id, status, created_at")
      .eq("tenant_id", tenantId)
      .ilike("booking_number", `%${searchTerm}%`)
      .limit(5);

    // Search providers (by business name, owner name, or email)
    const { data: providers, error: providersError } = await supabase
      .from("providers")
      .select("id, business_name, owner_name, owner_email, status")
      .eq("tenant_id", tenantId)
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
