import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadMatchRank = "invite_token" | "email" | "phone";

export interface LeadMatchCandidate {
  id: string;
  rank: LeadMatchRank;
  created_at?: string | null;
}

export interface ConsolidateLeadsOnSignupParams {
  supabase: SupabaseClient;
  tenantId: string;
  providerId: string;
  userId: string;
  inviteToken?: string | null;
  email?: string | null;
  phone?: string | null;
  matchContext?: "self_serve" | "admin_assisted";
}

export interface ConsolidateLeadsOnSignupResult {
  primaryLeadId: string | null;
  consolidatedLeadIds: string[];
  matchType: LeadMatchRank | "auto_self_serve" | "admin_assisted" | null;
}

function rankValue(rank: LeadMatchRank): number {
  if (rank === "invite_token") return 0;
  if (rank === "email") return 1;
  return 2;
}

/**
 * Match all open duplicate leads on provider signup.
 * Primary: invite token > email > phone (oldest first within same rank).
 * Additional matches are consolidated into the primary with activity notes.
 */
export async function consolidateLeadsOnSignup(
  params: ConsolidateLeadsOnSignupParams,
): Promise<ConsolidateLeadsOnSignupResult> {
  const { supabase, tenantId, providerId, userId, inviteToken, email, phone } = params;
  const matchContext = params.matchContext ?? "self_serve";
  const candidates: LeadMatchCandidate[] = [];
  const seen = new Set<string>();

  if (inviteToken) {
    const { data: tokenLeads } = await supabase
      .from("provider_leads")
      .select("id, created_at")
      .eq("tenant_id", tenantId)
      .eq("invite_token", inviteToken)
      .is("deleted_at", null)
      .is("matched_provider_id", null)
      .order("created_at", { ascending: true });
    for (const row of tokenLeads ?? []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push({ id: row.id, rank: "invite_token", created_at: row.created_at });
      }
    }
  }

  const matchConditions: string[] = [];
  const normalizedEmail = email?.toLowerCase()?.trim();
  if (normalizedEmail) matchConditions.push(`email.ilike.${normalizedEmail}`);
  if (phone) matchConditions.push(`phone_e164.eq.${phone}`);

  if (matchConditions.length > 0) {
    const { data: contactLeads } = await supabase
      .from("provider_leads")
      .select("id, email, phone_e164, created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .is("matched_provider_id", null)
      .or(matchConditions.join(","))
      .order("created_at", { ascending: true });

    for (const row of contactLeads ?? []) {
      if (seen.has(row.id)) continue;
      let rank: LeadMatchRank = "phone";
      if (normalizedEmail && row.email?.toLowerCase() === normalizedEmail) rank = "email";
      else if (phone && row.phone_e164 === phone) rank = "phone";
      seen.add(row.id);
      candidates.push({ id: row.id, rank, created_at: row.created_at });
    }
  }

  if (candidates.length === 0) {
    return { primaryLeadId: null, consolidatedLeadIds: [], matchType: null };
  }

  candidates.sort((a, b) => {
    const rankDiff = rankValue(a.rank) - rankValue(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });

  const primary = candidates[0];
  const additional = candidates.slice(1);
  const now = new Date().toISOString();
  const matchType =
    primary.rank === "invite_token"
      ? "invite_token"
      : matchContext === "admin_assisted"
        ? "admin_assisted"
        : "auto_self_serve";

  const primaryDescription =
    primary.rank === "invite_token"
      ? "Matched via onboarding invite link"
      : matchContext === "admin_assisted"
        ? "Matched to provider via admin-assisted onboarding"
        : "Auto-matched to self-serve signup";

  await supabase
    .from("provider_leads")
    .update({
      matched_provider_id: providerId,
      matched_user_id: userId,
      match_confidence: 1.0,
      matched_at: now,
      commercial_stage: "matched",
      ...(primary.rank === "invite_token" ? { invite_accepted_at: now } : {}),
    })
    .eq("id", primary.id);

  await supabase.from("providers").update({ lead_id: primary.id }).eq("id", providerId);
  await supabase
    .from("provider_onboarding_tracking")
    .update({ lead_id: primary.id })
    .eq("user_id", userId);

  await supabase.from("provider_lead_activities").insert({
    lead_id: primary.id,
    activity_type: "match_confirmed",
    description: primaryDescription,
    metadata: { provider_id: providerId, match_type: matchType, primary: true },
  });

  for (const dup of additional) {
    await supabase
      .from("provider_leads")
      .update({
        matched_provider_id: providerId,
        matched_user_id: userId,
        match_confidence: 1.0,
        matched_at: now,
        commercial_stage: "matched",
      })
      .eq("id", dup.id);

    await supabase.from("provider_lead_activities").insert({
      lead_id: dup.id,
      activity_type: "match_confirmed",
      description: `Consolidated into primary lead ${primary.id}`,
      metadata: {
        provider_id: providerId,
        match_type: matchType,
        consolidated_into: primary.id,
        duplicate: true,
      },
    });
  }

  return {
    primaryLeadId: primary.id,
    consolidatedLeadIds: additional.map((d) => d.id),
    matchType,
  };
}
