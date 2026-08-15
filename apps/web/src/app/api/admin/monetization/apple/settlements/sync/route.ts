import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { syncAppleFinanceReports } from "@/lib/iap/apple/finance-reports";

/**
 * POST /api/admin/monetization/apple/settlements/sync
 * Pull the latest unpublished App Store Connect financial reports.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const supabase = getSupabaseAdmin();
    const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
    if (!tenant?.id) {
      throw new Error("Default platform tenant (slug=za) is not configured");
    }

    const result = await syncAppleFinanceReports({
      supabase,
      tenantId: tenant.id as string,
      createdBy: user.id,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.settlements.synced",
      entity_type: "apple_settlements",
      after_json: result,
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
