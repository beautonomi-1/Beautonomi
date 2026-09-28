import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin", "admin_finance"], request);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("payroll_rule_sets")
      .select(
        "id, jurisdiction_code, rule_type, effective_from, effective_to, status, verified_by, verified_by_secondary, published_at",
      )
      .order("jurisdiction_code")
      .order("effective_from", { ascending: false })
      .limit(200);
    if (error) throw error;
    return successResponse(data ?? []);
  } catch (error) {
    return handleApiError(error, "Failed to list payroll rule sets");
  }
}
