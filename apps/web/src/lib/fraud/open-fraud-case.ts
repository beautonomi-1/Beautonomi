import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { slackNotifyFraudCaseOpened } from "@/lib/integrations/slack/ops-triggers";
import type { FraudSignalKind } from "./fraud-risk-scores";

export type OpenFraudCaseInput = {
  tenantId: string;
  subjectUserId?: string | null;
  subjectProviderId?: string | null;
  paymentProvider?: string | null;
  paymentReference?: string | null;
  riskScore: number;
  signal: FraudSignalKind | string;
  signals?: Record<string, unknown>;
  idempotencyKey: string;
  status?: "open" | "held";
  /** When true, skip Slack alert (e.g. agent-approved open already notified). */
  skipSlack?: boolean;
};

export type OpenFraudCaseResult = {
  fraudCaseId: string;
  created: boolean;
  alreadyExisted: boolean;
};

function buildSignalsPayload(input: OpenFraudCaseInput): Record<string, unknown> {
  const base = input.signals ?? {};
  return {
    ...base,
    signal: input.signal,
    opened_at: new Date().toISOString(),
    ...(input.signal === "psp.chargeback" ? { recommend_hold: true } : {}),
  };
}

async function findExistingByIdempotency(
  supabase: SupabaseClient,
  tenantId: string,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("fraud_cases")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return data as { id: string } | null;
}

async function findOpenCaseForPaymentReference(
  supabase: SupabaseClient,
  tenantId: string,
  paymentReference: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("fraud_cases")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("payment_reference", paymentReference)
    .in("status", ["open", "review", "held"])
    .limit(1)
    .maybeSingle();
  return data as { id: string } | null;
}

/**
 * Idempotently open a fraud case from a deterministic external signal.
 * Agents and humans dispose separately; this never closes or holds payouts.
 */
export async function openFraudCase(
  input: OpenFraudCaseInput,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<OpenFraudCaseResult> {
  const existingByKey = await findExistingByIdempotency(
    supabase,
    input.tenantId,
    input.idempotencyKey,
  );
  if (existingByKey) {
    return {
      fraudCaseId: existingByKey.id,
      created: false,
      alreadyExisted: true,
    };
  }

  if (input.paymentReference?.trim()) {
    const existingByPayment = await findOpenCaseForPaymentReference(
      supabase,
      input.tenantId,
      input.paymentReference.trim(),
    );
    if (existingByPayment) {
      return {
        fraudCaseId: existingByPayment.id,
        created: false,
        alreadyExisted: true,
      };
    }
  }

  const { data: created, error } = await supabase
    .from("fraud_cases")
    .insert({
      tenant_id: input.tenantId,
      status: input.status ?? "open",
      risk_score: input.riskScore,
      subject_user_id: input.subjectUserId ?? null,
      subject_provider_id: input.subjectProviderId ?? null,
      payment_provider: input.paymentProvider ?? null,
      payment_reference: input.paymentReference ?? null,
      idempotency_key: input.idempotencyKey,
      signals: buildSignalsPayload(input),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const retry = await findExistingByIdempotency(supabase, input.tenantId, input.idempotencyKey);
      if (retry) {
        return { fraudCaseId: retry.id, created: false, alreadyExisted: true };
      }
    }
    throw error;
  }

  if (!created) {
    throw new Error("fraud_case_insert_failed");
  }

  const fraudCaseId = (created as { id: string }).id;

  if (!input.skipSlack) {
    try {
      slackNotifyFraudCaseOpened({
        tenantId: input.tenantId,
        fraudCaseId,
        signal: input.signal,
        riskScore: input.riskScore,
        paymentReference: input.paymentReference ?? null,
      });
    } catch (err) {
      console.warn("[openFraudCase] slack notify failed:", err);
    }
  }

  return { fraudCaseId, created: true, alreadyExisted: false };
}
