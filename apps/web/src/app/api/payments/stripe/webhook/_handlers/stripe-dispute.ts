import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { openFraudCase } from "@/lib/fraud/open-fraud-case";
import { riskScoreForSignal } from "@/lib/fraud/fraud-risk-scores";
import { resolvePaymentFraudSubjects } from "@/lib/fraud/resolve-payment-fraud-subjects";

type StripeDisputeLike = {
  id?: string;
  charge?: string;
  payment_intent?: string;
  amount?: number;
  currency?: string;
  reason?: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Handle Stripe `charge.dispute.created` — open a fraud case for Trust review.
 */
export async function handleStripeChargeDisputeCreated(
  dispute: StripeDisputeLike,
  eventId?: string,
): Promise<void> {
  const disputeId = dispute.id?.trim();
  if (!disputeId) return;

  const supabase: SupabaseClient = getSupabaseAdmin();

  let reference =
    typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
  if (!reference && typeof dispute.charge === "string") {
    reference = dispute.charge;
  }

  let subjects = reference
    ? await resolvePaymentFraudSubjects(reference, "stripe", supabase)
    : {
        tenantId: null,
        subjectUserId: null,
        subjectProviderId: null,
        bookingId: null,
      };

  if (!subjects.tenantId && dispute.metadata?.tenant_id) {
    subjects = {
      ...subjects,
      tenantId: String(dispute.metadata.tenant_id),
    };
  }

  if (!subjects.tenantId) {
    const { data: za } = await supabase.from("tenants").select("id").eq("slug", "za").maybeSingle();
    subjects = { ...subjects, tenantId: (za as { id?: string } | null)?.id ?? null };
  }

  if (!subjects.tenantId) {
    console.warn("[stripe/dispute] could not resolve tenant for dispute", disputeId);
    return;
  }

  await openFraudCase(
    {
      tenantId: subjects.tenantId,
      subjectUserId: subjects.subjectUserId,
      subjectProviderId: subjects.subjectProviderId,
      paymentProvider: "stripe",
      paymentReference: reference,
      riskScore: riskScoreForSignal("psp.chargeback"),
      signal: "psp.chargeback",
      idempotencyKey: `stripe:dispute:${disputeId}`,
      signals: {
        source: "stripe.webhook",
        event_id: eventId ?? null,
        dispute_id: disputeId,
        charge_id: dispute.charge ?? null,
        amount: dispute.amount ?? null,
        currency: dispute.currency ?? null,
        reason: dispute.reason ?? null,
        status: dispute.status ?? null,
        related: {
          booking_id: subjects.bookingId,
        },
        recommend_hold: true,
      },
    },
    supabase,
  );
}
