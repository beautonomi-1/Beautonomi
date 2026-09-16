import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveProviderPayoutHold = {
  id: string;
  provider_id: string;
  fraud_case_id: string | null;
  reason: string;
  placed_by: string;
  created_at: string;
};

export async function getActiveProviderPayoutHold(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ActiveProviderPayoutHold | null> {
  const { data, error } = await supabase
    .from("provider_payout_holds")
    .select("id, provider_id, fraud_case_id, reason, placed_by, created_at")
    .eq("provider_id", providerId)
    .is("released_at", null)
    .maybeSingle();

  if (error) throw error;
  return data as ActiveProviderPayoutHold | null;
}

export async function getActiveProviderPayoutHoldsForProviders(
  supabase: SupabaseClient,
  providerIds: string[],
): Promise<Map<string, ActiveProviderPayoutHold>> {
  if (providerIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("provider_payout_holds")
    .select("id, provider_id, fraud_case_id, reason, placed_by, created_at")
    .in("provider_id", providerIds)
    .is("released_at", null);

  if (error) throw error;
  const map = new Map<string, ActiveProviderPayoutHold>();
  for (const row of data ?? []) {
    map.set(row.provider_id as string, row as ActiveProviderPayoutHold);
  }
  return map;
}

export async function placeProviderPayoutHold(params: {
  supabase: SupabaseClient;
  tenantId: string;
  providerId: string;
  fraudCaseId: string;
  placedBy: string;
  reason: string;
}): Promise<ActiveProviderPayoutHold> {
  const { supabase, tenantId, providerId, fraudCaseId, placedBy, reason } = params;
  const existing = await getActiveProviderPayoutHold(supabase, providerId);
  if (existing) {
    if (existing.fraud_case_id === fraudCaseId) return existing;
    throw new Error("Provider already has an active payout hold from another case");
  }

  const { data, error } = await supabase
    .from("provider_payout_holds")
    .insert({
      tenant_id: tenantId,
      provider_id: providerId,
      fraud_case_id: fraudCaseId,
      placed_by: placedBy,
      reason: reason.trim(),
    })
    .select("id, provider_id, fraud_case_id, reason, placed_by, created_at")
    .single();

  if (error) throw error;
  return data as ActiveProviderPayoutHold;
}

export async function releaseProviderPayoutHold(params: {
  supabase: SupabaseClient;
  providerId: string;
  releasedBy: string;
  releaseReason?: string;
  fraudCaseId?: string;
}): Promise<boolean> {
  const { supabase, providerId, releasedBy, releaseReason, fraudCaseId } = params;
  let query = supabase
    .from("provider_payout_holds")
    .update({
      released_at: new Date().toISOString(),
      released_by: releasedBy,
      release_reason: releaseReason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId)
    .is("released_at", null);

  if (fraudCaseId) query = query.eq("fraud_case_id", fraudCaseId);

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
