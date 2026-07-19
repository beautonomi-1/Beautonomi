import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { redactObject } from "@beautonomi/agent-tools";
import type { AgentPrincipal } from "@beautonomi/agent-policy";

/** Service-role queries are private; always verify against principal.tenantId. */
export async function readSupportTicket(principal: AgentPrincipal, ticketId: string) {
  const supabase = getSupabaseAdmin();
  // support_tickets has no tenant_id column — tenant scope comes from the
  // ticket's provider (platform tickets resolve to the default ZA tenant).
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, status, priority, category, created_at, provider_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("ticket_not_found");
  const { resolveSupportTicketTenantId } = await import("../support-ticket-tenant");
  const ticketTenantId = await resolveSupportTicketTenantId(supabase, data);
  if (ticketTenantId !== principal.tenantId) throw new Error("ticket_not_found");
  return redactObject(
    {
      id: data.id,
      subject: data.subject,
      status: data.status,
      priority: data.priority,
      category: data.category,
      createdAt: data.created_at,
    },
    ["id", "subject", "status", "priority", "category", "createdAt"],
  ) as {
    id: string;
    subject: string;
    status: string;
    priority: string | null;
    category: string | null;
    createdAt: string;
  };
}

export async function readSystemHealth(_principal: AgentPrincipal, environment: string) {
  const supabase = getSupabaseAdmin();
  const checks: Array<{ name: string; ok: boolean }> = [];
  try {
    const { error } = await supabase.from("agent_module_config").select("environment").limit(1);
    checks.push({ name: "database", ok: !error });
  } catch {
    checks.push({ name: "database", ok: false });
  }
  checks.push({ name: "environment", ok: ["production", "staging", "development"].includes(environment) });
  const okCount = checks.filter((c) => c.ok).length;
  return {
    status: okCount === checks.length ? ("healthy" as const) : okCount > 0 ? ("degraded" as const) : ("down" as const),
    checks,
  };
}

export async function readPayoutSummary(principal: AgentPrincipal, payoutId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payouts")
    .select("id, amount, currency, status, provider_id, tenant_id")
    .eq("id", payoutId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("payout_not_found");
  return {
    id: data.id,
    amount: Number(data.amount),
    currency: data.currency,
    status: data.status,
    providerId: data.provider_id,
  };
}

export async function readFraudCaseBriefing(principal: AgentPrincipal, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fraud_cases")
    .select("id, status, risk_score, signals, tenant_id")
    .eq("id", caseId)
    .eq("tenant_id", principal.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("fraud_case_not_found");
  const signals = typeof data.signals === "object" && data.signals ? Object.keys(data.signals as object) : [];
  return {
    id: data.id,
    status: data.status,
    riskScore: data.risk_score != null ? Number(data.risk_score) : null,
    signalsSummary: signals.slice(0, 10).join(", ") || "none",
  };
}
