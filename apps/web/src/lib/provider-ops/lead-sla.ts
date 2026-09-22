import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProviderOpsSettings } from "@/lib/provider-ops/ops-settings";

const ACTIVE_STAGES = ["contacted", "qualified", "proposal_sent", "negotiating", "nurture"] as const;

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** Lead IDs breaching tenant SLA (first contact, follow-up date, or stage stale). */
export async function fetchSlaBreachedLeadIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const settings = await loadProviderOpsSettings(supabase, tenantId);
  const ids = new Set<string>();
  const nowIso = new Date().toISOString();
  const firstContactCutoff = hoursAgoIso(settings.sla_first_contact_hours);
  const staleCutoff = hoursAgoIso(settings.sla_stage_stale_hours);

  const { data: followUpRows } = await supabase
    .from("provider_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .not("next_follow_up_at", "is", null)
    .lt("next_follow_up_at", nowIso);
  for (const r of followUpRows ?? []) ids.add(r.id);

  const { data: newLeads } = await supabase
    .from("provider_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .eq("commercial_stage", "new")
    .lt("created_at", firstContactCutoff);
  const newIds = (newLeads ?? []).map((r) => r.id);
  if (newIds.length > 0) {
    const { data: cases } = await supabase
      .from("provider_ops_cases")
      .select("lead_id, first_contacted_at")
      .eq("tenant_id", tenantId)
      .in("lead_id", newIds);
    const contacted = new Set(
      (cases ?? []).filter((c) => c.first_contacted_at).map((c) => c.lead_id as string),
    );
    for (const id of newIds) {
      if (!contacted.has(id)) ids.add(id);
    }
  }

  const { data: staleLeads } = await supabase
    .from("provider_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("commercial_stage", [...ACTIVE_STAGES])
    .lt("updated_at", staleCutoff);
  for (const r of staleLeads ?? []) ids.add(r.id);

  return [...ids];
}

export async function emitHighValueLeadSlackIfNeeded(
  supabase: SupabaseClient,
  tenantId: string,
  lead: { id: string; business_name?: string | null; deal_value?: number | null; assigned_to?: string | null },
): Promise<void> {
  const settings = await loadProviderOpsSettings(supabase, tenantId);
  const value = lead.deal_value != null ? Number(lead.deal_value) : null;
  if (value == null || Number.isNaN(value) || value < settings.high_value_threshold) return;

  const { slackNotifyHighValueLeadForTenant } = await import(
    "@/lib/integrations/slack/lead-triggers"
  );
  void slackNotifyHighValueLeadForTenant(tenantId, lead);
}
