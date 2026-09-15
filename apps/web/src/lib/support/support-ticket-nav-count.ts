import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import type { UserRole } from "@/types/beautonomi";

function isSupportStaffGlobalQueue(role: string | null | undefined): boolean {
  const normalized = String(role ?? "").toLowerCase();
  return (SUPPORT_TICKET_STAFF_ROLES as readonly string[]).includes(normalized);
}

function isUndefinedColumnError(error: unknown): boolean {
  return (error as { code?: string })?.code === "42703";
}

/**
 * Count actionable human support tickets for sidebar badges.
 * Uses `needs_agent_response` when migration 726 is applied; falls back to open tickets.
 */
export async function countSupportTicketsForNav(
  supabase: SupabaseClient,
  params: { role: string | null | undefined; tenantProviderIds: string[] },
): Promise<{ awaiting_response: number; sla_breached: number }> {
  const nowIso = new Date().toISOString();
  const globalQueue = isSupportStaffGlobalQueue(params.role);

  const countAwaiting = async (useAgentQueue: boolean) => {
    let query = supabase.from("support_tickets").select("id", { count: "exact", head: true });
    if (useAgentQueue) {
      query = query.eq("needs_agent_response", true);
    } else {
      query = query.eq("status", "open");
    }
    if (!globalQueue && params.tenantProviderIds.length > 0) {
      query = query.in("provider_id", params.tenantProviderIds);
    } else if (!globalQueue) {
      return { count: 0, error: null };
    }
    return query;
  };

  const countSlaBreached = async () => {
    let query = supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .lt("sla_resolution_due_at", nowIso)
      .not("status", "in", '("resolved","closed")');
    if (!globalQueue && params.tenantProviderIds.length > 0) {
      query = query.in("provider_id", params.tenantProviderIds);
    } else if (!globalQueue) {
      return { count: 0, error: null };
    }
    return query;
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
