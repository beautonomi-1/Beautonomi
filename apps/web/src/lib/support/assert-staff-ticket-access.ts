import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupportAgentTenantIds,
  isSupportAgentRole,
  supportAgentCanAccessTicketByTenant,
} from "@/lib/support/support-agent-tenant-scope";

/** Returns false when a support_agent may not access this ticket (service-role routes). */
export async function staffCanAccessSupportTicket(
  supabase: SupabaseClient,
  params: {
    role: string | null | undefined;
    userId: string;
    tenantId: string | null | undefined;
  },
): Promise<boolean> {
  return supportAgentCanAccessTicketByTenant(supabase, params);
}

/** Restrict bulk updates to tickets the support_agent may access. */
export async function filterSupportTicketIdsForStaffAccess(
  supabase: SupabaseClient,
  params: {
    role: string | null | undefined;
    userId: string;
    ticketIds: string[];
  },
): Promise<string[]> {
  if (!isSupportAgentRole(params.role) || params.ticketIds.length === 0) {
    return params.ticketIds;
  }
  const allowedTenants = await getSupportAgentTenantIds(supabase, params.userId);
  if (allowedTenants.length === 0) return [];
  const { data: rows, error } = await supabase
    .from("support_tickets")
    .select("id, tenant_id")
    .in("id", params.ticketIds);
  if (error) throw error;
  return (rows ?? [])
    .filter((r) => {
      const tid = (r as { tenant_id?: string | null }).tenant_id;
      return tid && allowedTenants.includes(tid);
    })
    .map((r) => (r as { id: string }).id);
}

export async function assertStaffCanAccessSupportTicket(
  supabase: SupabaseClient,
  params: {
    role: string | null | undefined;
    userId: string;
    tenantId: string | null | undefined;
  },
): Promise<void> {
  if (!isSupportAgentRole(params.role)) return;
  const ok = await supportAgentCanAccessTicketByTenant(supabase, params);
  if (!ok) {
    const err = new Error("Ticket not found");
    (err as { status?: number }).status = 404;
    throw err;
  }
}
