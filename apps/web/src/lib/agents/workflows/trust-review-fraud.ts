/**
 * Review-fraud sentinel — detects rating manipulation patterns and proposes a
 * `trust.open_case` action. On approval the executor opens a fraud_cases row
 * for the trust team; the agent never suspends anyone or hides reviews itself.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";

const RECENT_WINDOW_DAYS = 30;
const MIN_SUSPICIOUS = 3;
const SUSPICIOUS_RATIO = 0.6;
const NEW_ACCOUNT_DAYS = 7;

export type ReviewSignal = {
  rating: number;
  customerAccountAgeDaysAtReview: number;
};

/** Pure + testable: burst of 5-star reviews from brand-new accounts. */
export function detectReviewFraudPattern(reviews: ReviewSignal[]): {
  suspicious: boolean;
  suspiciousCount: number;
  totalRecent: number;
} {
  const suspiciousCount = reviews.filter(
    (r) => r.rating === 5 && r.customerAccountAgeDaysAtReview < NEW_ACCOUNT_DAYS,
  ).length;
  const totalRecent = reviews.length;
  return {
    suspicious:
      suspiciousCount >= MIN_SUSPICIOUS && totalRecent > 0 && suspiciousCount / totalRecent >= SUSPICIOUS_RATIO,
    suspiciousCount,
    totalRecent,
  };
}

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

export async function runReviewFraudSweepForTenant(params: {
  tenantId: string;
  environment?: string;
}): Promise<{ skipped: true; reason: string } | { casesProposed: number; errors: string[] }> {
  const module = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("trust-monitor");
  if (!def) return { skipped: true, reason: "trust_monitor_not_configured" };
  const op = await loadAgentOperationalState("trust-monitor");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  let casesProposed = 0;
  const errors: string[] = [];
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 3600_000).toISOString();

  const { data: providers } = await supabase
    .from("providers")
    .select("id, business_name")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active")
    .limit(200);

  for (const p of providers ?? []) {
    if (casesProposed >= 5) break;
    try {
      const { data: reviews } = await supabase
        .from("reviews")
        .select("id, rating, created_at, customer:users!reviews_customer_id_fkey(created_at)")
        .eq("provider_id", p.id)
        .gte("created_at", since)
        .limit(100);
      if (!reviews || reviews.length < MIN_SUSPICIOUS) continue;

      const signals: ReviewSignal[] = reviews.map((r) => {
        const customerCreated = (r.customer as { created_at?: string } | null)?.created_at;
        const ageMs = customerCreated
          ? new Date(String(r.created_at)).getTime() - new Date(customerCreated).getTime()
          : Number.MAX_SAFE_INTEGER;
        return {
          rating: Number(r.rating ?? 0),
          customerAccountAgeDaysAtReview: ageMs / (24 * 3600_000),
        };
      });

      const pattern = detectReviewFraudPattern(signals);
      if (!pattern.suspicious) continue;

      // Skip when an open fraud case already exists for this provider.
      const { data: existingCase } = await supabase
        .from("fraud_cases")
        .select("id")
        .eq("tenant_id", params.tenantId)
        .eq("subject_provider_id", p.id)
        .in("status", ["open", "review", "held"])
        .limit(1);
      if ((existingCase ?? []).length > 0) continue;

      await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: def.id,
        actionType: "trust.open_case",
        targetType: "provider",
        targetId: p.id,
        proposedPayload: {
          subjectProviderId: p.id,
          riskScore: Math.min(95, 50 + pattern.suspiciousCount * 10),
          signals: {
            kind: "review_fraud_pattern",
            suspicious_five_star_from_new_accounts: pattern.suspiciousCount,
            recent_reviews_total: pattern.totalRecent,
            window_days: RECENT_WINDOW_DAYS,
          },
          summary: `${pattern.suspiciousCount} of ${pattern.totalRecent} recent reviews for ${p.business_name} are 5-star ratings from accounts younger than ${NEW_ACCOUNT_DAYS} days.`,
        },
        reasoningSummary: `Possible rating manipulation on ${p.business_name}: ${pattern.suspiciousCount}/${pattern.totalRecent} recent 5-star reviews came from brand-new accounts. Approve to open a fraud case for human investigation.`,
        riskLevel: 2,
        policyVersion: def.active_version,
        idempotencyKey: `review-fraud:${p.id}:${new Date().toISOString().slice(0, 7)}`,
      });
      casesProposed += 1;
    } catch (err) {
      if (!isDuplicate(err)) errors.push(`review-fraud:${p.id}:${String(err).slice(0, 120)}`);
    }
  }

  return { casesProposed, errors };
}
