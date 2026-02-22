import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const { data: method } = await supabaseAdmin
      .from("provider_payment_methods")
      .select("brand, last4, exp_month, exp_year, is_default")
      .eq("provider_id", providerId)
      .eq("is_default", true)
      .maybeSingle();

    if (!method) {
      return successResponse(null);
    }

    return successResponse({
      brand: method.brand || "Unknown",
      last4: method.last4 || "****",
      exp_month: method.exp_month || 0,
      exp_year: method.exp_year || 0,
    });
  } catch (error) {
    console.error("Error fetching payment method:", error);
    return handleApiError(error, "Failed to load payment method");
  }
}
