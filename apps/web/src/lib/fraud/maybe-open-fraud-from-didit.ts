import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { openFraudCase } from "@/lib/fraud/open-fraud-case";
import { riskScoreForSignal } from "@/lib/fraud/fraud-risk-scores";

/**
 * Open fraud case when Didit verification is rejected or has a name mismatch flag.
 */
export async function maybeOpenFraudCaseFromDiditSession(params: {
  sessionId: string;
  session: Record<string, unknown>;
  outcome: "rejected" | "name_mismatch";
  rejectionReason?: string | null;
  supabase?: SupabaseClient;
}): Promise<void> {
  const supabase = params.supabase ?? getSupabaseAdmin();
  const tenantId = (params.session.tenant_id as string | null) ?? null;
  if (!tenantId) return;

  const isProvider = (params.session.persona_type as string) === "provider";
  const providerId = (params.session.provider_id as string | null) ?? null;
  const userId = (params.session.user_id as string | null) ?? null;

  const signal = params.outcome === "rejected" ? "identity.rejected" : "identity.name_mismatch";

  await openFraudCase(
    {
      tenantId,
      subjectUserId: userId,
      subjectProviderId: isProvider ? providerId : null,
      riskScore: riskScoreForSignal(signal),
      signal,
      idempotencyKey: `didit:session:${params.sessionId}:${params.outcome}`,
      signals: {
        source: "didit.webhook",
        verification_session_id: params.sessionId,
        persona_type: params.session.persona_type ?? null,
        rejection_reason: params.rejectionReason ?? null,
        related: {
          provider_id: providerId,
          user_id: userId,
        },
      },
    },
    supabase,
  );
}
