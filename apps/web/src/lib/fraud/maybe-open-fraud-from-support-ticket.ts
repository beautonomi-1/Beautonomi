import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { openFraudCase } from "@/lib/fraud/open-fraud-case";
import { riskScoreForSignal } from "@/lib/fraud/fraud-risk-scores";
import { resolveSupportTicketTenantId } from "@/lib/agents/support-ticket-tenant";

/**
 * When a user files a safety_fraud support ticket, open an internal fraud case.
 */
export async function maybeOpenFraudCaseFromSafetyTicket(params: {
  ticketId: string;
  category: string | null | undefined;
  userId: string | null | undefined;
  providerId: string | null | undefined;
  subject: string;
  message: string;
  supabase?: SupabaseClient;
}): Promise<string | null> {
  if (params.category !== "safety_fraud") return null;

  const supabase = params.supabase ?? getSupabaseAdmin();
  const tenantId = await resolveSupportTicketTenantId(supabase, {
    provider_id: params.providerId ?? null,
  });
  if (!tenantId) return null;

  const result = await openFraudCase(
    {
      tenantId,
      subjectUserId: params.userId ?? null,
      subjectProviderId: params.providerId ?? null,
      riskScore: riskScoreForSignal("support.safety_fraud"),
      signal: "support.safety_fraud",
      idempotencyKey: `support_ticket:${params.ticketId}`,
      signals: {
        source: "support_ticket",
        ticket_id: params.ticketId,
        subject: params.subject.slice(0, 200),
        message_excerpt: params.message.slice(0, 500),
      },
    },
    supabase,
  );

  try {
    const { data: existing } = await supabase
      .from("support_tickets")
      .select("metadata")
      .eq("id", params.ticketId)
      .maybeSingle();
    const meta = ((existing as { metadata?: Record<string, unknown> } | null)?.metadata ??
      {}) as Record<string, unknown>;
    await supabase
      .from("support_tickets")
      .update({
        metadata: { ...meta, fraud_case_id: result.fraudCaseId },
      })
      .eq("id", params.ticketId);
  } catch (err) {
    console.warn("[maybeOpenFraudCaseFromSafetyTicket] metadata update failed:", err);
  }

  return result.fraudCaseId;
}
