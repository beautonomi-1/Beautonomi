/**
 * Membership dunning agent — past-due memberships get a human-approved
 * payment-failed reminder (`membership.dunning`) instead of silently expiring
 * at the end of the grace window. Delivery uses the existing
 * `membership_payment_failed` notification template.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";

const PER_TENANT_LIMIT = 15;

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

export async function runMembershipDunningSweepForTenant(params: {
  tenantId: string;
  environment?: string;
}): Promise<{ skipped: true; reason: string } | { dunningProposals: number; errors: string[] }> {
  const agentModule = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: agentModule.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("ops-sentinel");
  if (!def) return { skipped: true, reason: "ops_sentinel_not_configured" };
  const op = await loadAgentOperationalState("ops-sentinel");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  let dunningProposals = 0;
  const errors: string[] = [];

  const { data: memberships } = await supabase
    .from("user_memberships")
    .select(
      "id, user_id, provider_id, status, renewal_failure_count, past_due_since, provider:providers!inner(tenant_id, business_name), plan:membership_plans(name)",
    )
    .eq("status", "past_due")
    .eq("provider.tenant_id", params.tenantId)
    .gte("renewal_failure_count", 1)
    .order("past_due_since", { ascending: true })
    .limit(PER_TENANT_LIMIT);

  for (const m of memberships ?? []) {
    try {
      const providerName =
        (m.provider as unknown as { business_name?: string } | null)?.business_name ?? "your provider";
      const planName = (m.plan as unknown as { name?: string } | null)?.name ?? "your membership";
      const failures = Number(m.renewal_failure_count ?? 1);

      await proposeAgentAction({
        tenantId: params.tenantId,
        agentId: def.id,
        actionType: "membership.dunning",
        targetType: "user_membership",
        targetId: String(m.id),
        proposedPayload: {
          membershipId: m.id,
          memberUserId: String(m.user_id),
          membershipName: planName,
          providerName,
          failureCount: failures,
        },
        reasoningSummary: `Membership "${planName}" at ${providerName} is past due (${failures} failed charge${failures === 1 ? "" : "s"}, since ${String(m.past_due_since ?? "").slice(0, 10)}). Approve to send a payment-failed reminder before it expires.`,
        riskLevel: 1,
        policyVersion: def.active_version,
        idempotencyKey: `membership-dunning:${m.id}:${failures}`,
      });
      dunningProposals += 1;
    } catch (err) {
      if (!isDuplicate(err)) errors.push(`dunning:${m.id}:${String(err).slice(0, 120)}`);
    }
  }

  return { dunningProposals, errors };
}
