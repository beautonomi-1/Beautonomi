import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/beautonomi";
import {
  allowedActionTypesForRole,
  PENDING_AGENT_STATUSES,
} from "@/lib/agents/actions/agent-action-list-filters";
import type { getEffectiveAdminSectionRoles } from "@/lib/supabase/api-helpers";
import { getAgentApprovalPolicy } from "@/lib/agents/actions/approval-policy";
import {
  ADMIN_SECTION_FINANCE,
  ADMIN_SECTION_PROVIDERS_OPERATIONS,
  ADMIN_SECTION_SUPPORT,
  ADMIN_SECTION_USERS_TRUST,
} from "@beautonomi/admin-access";

const SECTION_ROUTE: Record<string, string> = {
  [ADMIN_SECTION_SUPPORT]: "/admin/support-tickets/ai-drafts",
  [ADMIN_SECTION_FINANCE]: "/admin/finance/ai-queue",
  [ADMIN_SECTION_USERS_TRUST]: "/admin/trust-safety-ops/ai-queue",
  [ADMIN_SECTION_PROVIDERS_OPERATIONS]: "/admin/provider-ops/ai-queue",
};

/**
 * Count AI agent actions awaiting human approval, scoped to what the caller may approve.
 */
export async function countAgentProposalsForNav(
  supabase: SupabaseClient,
  params: {
    tenantId?: string | null;
    role?: UserRole;
    effectiveRoles?: Awaited<ReturnType<typeof getEffectiveAdminSectionRoles>>;
  } = {},
): Promise<number> {
  let query = supabase
    .from("agent_actions")
    .select("id", { count: "exact", head: true })
    .in("status", [...PENDING_AGENT_STATUSES]);

  if (params.tenantId) {
    query = query.eq("tenant_id", params.tenantId);
  }

  const role = params.role ?? "superadmin";
  if (role !== "superadmin" && params.effectiveRoles) {
    const allowedTypes = allowedActionTypesForRole(role, params.effectiveRoles);
    if (allowedTypes.length === 0) return 0;
    query = query.in("action_type", allowedTypes);
  }

  const { count, error } = await query;
  if (error) {
    console.warn("[countAgentProposalsForNav] failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Per-section nav badge counts keyed to domain AI queue routes. */
export async function countAgentProposalsBySection(
  supabase: SupabaseClient,
  params: {
    tenantId?: string | null;
    role?: UserRole;
    effectiveRoles?: Awaited<ReturnType<typeof getEffectiveAdminSectionRoles>>;
  } = {},
): Promise<Record<string, number>> {
  const role = params.role ?? "superadmin";

  let query = supabase
    .from("agent_actions")
    .select("action_type")
    .in("status", [...PENDING_AGENT_STATUSES]);

  if (params.tenantId) {
    query = query.eq("tenant_id", params.tenantId);
  }

  if (role !== "superadmin") {
    if (!params.effectiveRoles) return {};
    const allowedTypes = allowedActionTypesForRole(role, params.effectiveRoles);
    if (allowedTypes.length === 0) return {};
    query = query.in("action_type", allowedTypes);
  }

  const { data, error } = await query;
  if (error || !data?.length) return {};

  const counts: Record<string, number> = {};
  for (const row of data as { action_type: string }[]) {
    const policy = getAgentApprovalPolicy(row.action_type);
    if (!policy) continue;
    const href = SECTION_ROUTE[policy.section];
    if (!href) continue;
    counts[href] = (counts[href] ?? 0) + 1;
  }
  return counts;
}
