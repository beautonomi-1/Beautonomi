import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/me/role
 * Lightweight endpoint for mobile to check user role (for RoleGate).
 *
 * When the caller is the provider app (X-App: provider), users with users.role = 'customer'
 * are still treated as provider_owner if they own a provider or are owner in provider_staff,
 * so existing provider owners whose role was never upgraded can access the provider app.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );

    let role = user.role;

    // Provider context: web provider portal or provider app (X-App: provider or ?portal=provider)
    const isProviderApp = request.headers.get("X-App") === "provider";
    const isProviderPortal =
      request.nextUrl?.searchParams?.get("portal") === "provider";
    const isProviderContext = isProviderApp || isProviderPortal;

    // Provider context: allow customers who are actually provider owners (role may not have been upgraded)
    if (isProviderContext && role === "customer") {
      const supabaseAdmin = getSupabaseAdmin();
      const [ownerOfProvider, staffAsOwner] = await Promise.all([
        supabaseAdmin
          .from("providers")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("provider_staff")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "owner")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);
      if (ownerOfProvider.data || staffAsOwner.data) {
        role = "provider_owner";
        // Persist so future requests and other APIs see the correct role
        await supabaseAdmin
          .from("users")
          .update({ role: "provider_owner" })
          .eq("id", user.id);
      }
    }

    // Provider context: customers who are active staff (any role) get provider_staff for this request only (no DB write)
    if (isProviderContext && role === "customer") {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: staffRow } = await supabaseAdmin
        .from("provider_staff")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (staffRow) {
        role = "provider_staff";
      }
    }

    return successResponse({ role });
  } catch (error) {
    return handleApiError(error, "Failed to get role");
  }
}
