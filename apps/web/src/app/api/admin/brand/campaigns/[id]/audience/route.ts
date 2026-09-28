import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("tracking_code, audience_definition")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!campaign) return errorResponse("Not found", "NOT_FOUND", 404);

    const { data: marketAge } = await supabase.rpc("admin_dashboard_customer_age_brackets_by_tenant", {
      p_tenant_id: access.tenantId,
    });

    const { count: attributedSignups } = campaign.tracking_code
      ? await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("first_touch_utm_campaign", campaign.tracking_code)
      : { count: 0 };

    return successResponse({
      audience_definition: campaign.audience_definition ?? {},
      market_age_brackets: marketAge,
      attributed_signup_count: attributedSignups ?? 0,
      sample_note: "Full attributed age breakdown uses the campaign results period on the audience card.",
    });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to load audience");
  }
}
