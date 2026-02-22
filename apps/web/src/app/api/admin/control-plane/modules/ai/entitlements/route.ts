import { NextRequest, NextResponse } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/control-plane/modules/ai/entitlements
 * List AI plan entitlements. Query: plan_id (optional).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("plan_id") ?? undefined;

    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("ai_plan_entitlements")
      .select("id, plan_id, feature_key, enabled, calls_per_day, max_tokens, model_tier, updated_at")
      .order("plan_id")
      .order("feature_key");

    if (planId) q = q.eq("plan_id", planId);

    const { data, error } = await q;

    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch entitlements");
  }
}

/**
 * POST /api/admin/control-plane/modules/ai/entitlements
 * Create or upsert entitlement.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json();
    const { plan_id, feature_key, enabled = true, calls_per_day = 0, max_tokens = 600, model_tier = "cheap" } = body;

    if (!plan_id || !feature_key) {
      return NextResponse.json({ data: null, error: { message: "plan_id and feature_key required", code: "VALIDATION_ERROR" } }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_plan_entitlements")
      .upsert(
        {
          plan_id,
          feature_key,
          enabled: Boolean(enabled),
          calls_per_day: Number(calls_per_day),
          max_tokens: Number(max_tokens),
          model_tier: String(model_tier),
        },
        { onConflict: "plan_id,feature_key" }
      )
      .select()
      .single();

    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    return handleApiError(error as Error, "Failed to save entitlement");
  }
}
