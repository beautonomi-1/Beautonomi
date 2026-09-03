import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/cron-auth";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { syncAppleFinanceReports } from "@/lib/iap/apple/finance-reports";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const JOB_NAME = "sync-apple-finance-reports";
export const maxDuration = 300;

async function resolvePlatformTenantId() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
  if (!data?.id) {
    throw new Error("Default platform tenant (slug=za) is not configured");
  }
  return { supabase, tenantId: data.id as string };
}

/**
 * GET /api/cron/sync-apple-finance-reports
 * Pull unpublished App Store Connect financial reports into apple_settlements.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(JSON.stringify({ error: auth.error }), { status: 401 });
    }

    return await runLockedCronRoute(JOB_NAME, async () => {
      const { supabase, tenantId } = await resolvePlatformTenantId();
      const result = await syncAppleFinanceReports({ supabase, tenantId, createdBy: null });
      return successResponse(result);
    });
  } catch (error) {
    return handleApiError(error);
  }
}
