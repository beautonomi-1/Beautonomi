import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { openFraudCase } from "@/lib/fraud/open-fraud-case";
import { riskScoreForSignal } from "@/lib/fraud/fraud-risk-scores";
import { resolvePaymentFraudSubjects } from "@/lib/fraud/resolve-payment-fraud-subjects";

/**
 * Open a fraud case from a Paystack dispute.* webhook event.
 */
export async function openFraudCaseFromPaystackDispute(params: {
  eventType: string;
  eventId?: string;
  reference: string;
  disputeData?: Record<string, unknown> | null;
  supabase?: SupabaseClient;
}): Promise<void> {
  const supabase = params.supabase ?? getSupabaseAdmin();
  const reference = params.reference.trim();
  if (!reference) return;

  const subjects = await resolvePaymentFraudSubjects(reference, "paystack", supabase);
  let tenantId = subjects.tenantId;
  if (!tenantId) {
    const { data: za } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
    tenantId = (za as { id?: string } | null)?.id ?? null;
  }
  if (!tenantId) {
    console.warn("[paystack/dispute] could not resolve tenant for ref", reference);
    return;
  }

  const disputeData = params.disputeData ?? {};
  await openFraudCase(
    {
      tenantId,
      subjectUserId: subjects.subjectUserId,
      subjectProviderId: subjects.subjectProviderId,
      paymentProvider: "paystack",
      paymentReference: reference,
      riskScore: riskScoreForSignal("psp.chargeback"),
      signal: "psp.chargeback",
      idempotencyKey: `paystack:dispute:${reference}:${params.eventType}`,
      signals: {
        source: "paystack.webhook",
        event_id: params.eventId ?? null,
        event_type: params.eventType,
        amount: disputeData.amount ?? null,
        status: disputeData.status ?? null,
        resolution: disputeData.resolution ?? null,
        related: {
          booking_id: subjects.bookingId,
        },
        recommend_hold: true,
      },
    },
    supabase,
  );
}
