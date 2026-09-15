import type { SupabaseClient } from "@supabase/supabase-js";

const PENDING_STATUSES = ["proposed", "approval_pending"] as const;

/**
 * Count AI agent actions awaiting human approval (Agentic Console inbox depth).
 */
export async function countAgentProposalsForNav(
  supabase: SupabaseClient,
  params?: { tenantId?: string | null },
): Promise<number> {
  let query = supabase
    .from("agent_actions")
    .select("id", { count: "exact", head: true })
    .in("status", [...PENDING_STATUSES]);

  if (params?.tenantId) {
    query = query.eq("tenant_id", params.tenantId);
  }

  const { count, error } = await query;
  if (error) {
    console.warn("[countAgentProposalsForNav] failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
