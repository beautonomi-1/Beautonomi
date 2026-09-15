import type { SupabaseClient } from "@supabase/supabase-js";

type ContentReportRow = {
  target_type: string;
  target_id: string;
  tenant_id?: string | null;
  reporter_user_id?: string | null;
};

/** Resolve tenant for agent_actions.tenant_id (NOT NULL). */
export async function resolveContentReportTenantId(
  supabase: SupabaseClient,
  report: ContentReportRow,
): Promise<string | null> {
  if (report.tenant_id) return report.tenant_id;

  if (report.target_type === "explore_post") {
    const { data: post } = await supabase
      .from("explore_posts")
      .select("created_by_user_id")
      .eq("id", report.target_id)
      .maybeSingle();
    const userId = (post as { created_by_user_id?: string | null } | null)?.created_by_user_id;
    if (userId) {
      const { data: provider } = await supabase
        .from("providers")
        .select("tenant_id")
        .eq("owner_user_id", userId)
        .maybeSingle();
      if ((provider as { tenant_id?: string } | null)?.tenant_id) {
        return (provider as { tenant_id: string }).tenant_id;
      }
    }
  }

  const { data: za } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
  return (za as { id?: string } | null)?.id ?? null;
}
