import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupportAgentRole, isSuperadminRole } from "@/lib/support/support-agent-tenant-scope";
import type { UserRole } from "@/types/beautonomi";

function isUndefinedColumnError(error: unknown): boolean {
  return (error as { code?: string })?.code === "42703";
}

/**
 * Count actionable human support tickets for sidebar badges.
 * Uses `needs_agent_response` when migration 726 is applied; falls back to open tickets.
 */
export async function countSupportTicketsForNav(
  supabase: SupabaseClient,
  params: {
    role: string | null | undefined;
    tenantProviderIds: string[];
    supportAgentTenantIds?: string[];
  },
): Promise<{ awaiting_response: number; sla_breached: number }> {
  const nowIso = new Date().toISOString();
  const scopedAgent =
    isSupportAgentRole(params.role) && !isSuperadminRole(params.role);
  const agentTenantIds = params.supportAgentTenantIds ?? [];

  type CountResult = { count: number | null; error: unknown };
  type ScopedQuery<T> = T | CountResult;

  const applyScope = <T extends { in: (col: string, vals: string[]) => T }>(
    query: T,
  ): ScopedQuery<T> => {
    if (!scopedAgent) return query;
    if (agentTenantIds.length === 0) return { count: 0, error: null };
    return query.in("tenant_id", agentTenantIds);
  };

  const countAwaiting = async (useAgentQueue: boolean): Promise<CountResult> => {
    let query = supabase.from("support_tickets").select("id", { count: "exact", head: true });
    if (useAgentQueue) {
      query = query.eq("needs_agent_response", true);
    } else {
      query = query.eq("status", "open");
    }
    const scoped = applyScope(query);
    if ("count" in scoped) return scoped;
    return scoped;
  };

  const countSlaBreached = async (): Promise<CountResult> => {
    let query = supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .lt("sla_resolution_due_at", nowIso)
      .not("status", "in", '("resolved","closed")');
    const scoped = applyScope(query);
    if ("count" in scoped) return scoped;
    return scoped;
  };

  let actionableResult = await countAwaiting(true);
  if (actionableResult.error && isUndefinedColumnError(actionableResult.error)) {
    actionableResult = await countAwaiting(false);
  }

  const slaBreachedResult = await countSlaBreached();

  return {
    awaiting_response: actionableResult.count ?? 0,
    sla_breached: slaBreachedResult.count ?? 0,
  };
}

export type { UserRole };
