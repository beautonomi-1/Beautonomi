import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const body = await request.json();
    const { plan_id } = body;

    if (!plan_id) {
      return handleApiError(new Error("plan_id is required"), "VALIDATION_ERROR", 400);
    }

    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name")
      .eq("id", plan_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!plan) {
      return handleApiError(new Error("Plan not found"), "NOT_FOUND", 404);
    }

    const { error: updateError } = await supabaseAdmin
      .from("provider_subscriptions")
      .update({ plan_id, updated_at: new Date().toISOString() })
      .eq("provider_id", providerId);

    if (updateError) {
      const { error: insertError } = await supabaseAdmin
        .from("provider_subscriptions")
        .insert({ provider_id: providerId, plan_id, status: "active" });
      if (insertError) throw insertError;
    }

    return successResponse({ success: true });
  } catch (error) {
    console.error("Error changing subscription:", error);
    return handleApiError(error, "Failed to change subscription plan");
  }
}
