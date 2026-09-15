import type { SupabaseClient } from "@supabase/supabase-js";

type ReportRow = {
  tenant_id?: string | null;
  target_type?: string;
  target_id?: string;
};

export async function resolveContentReportTenantId(
  supabase: SupabaseClient,
  report: ReportRow,
): Promise<string | null> {
  if (report.tenant_id) return String(report.tenant_id);
  if (report.target_type === "explore_post" && report.target_id) {
    const { data: post } = await supabase
      .from("explore_posts")
      .select("tenant_id")
      .eq("id", report.target_id)
      .maybeSingle();
    const tenantId = (post as { tenant_id?: string | null } | null)?.tenant_id;
    if (tenantId) return String(tenantId);
  }
  return null;
}
