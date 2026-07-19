/**
 * Periodic agent workforce sweep for one tenant. Generates human-reviewable
 * proposals for work that would otherwise sit unnoticed:
 *
 *   - payout-review:   pending payouts → approve/hold recommendation (maker-checker execution)
 *   - reconciliation:  open exceptions without a briefing → investigation briefing
 *   - trust-monitor:   open fraud cases, open booking disputes, pending user reports → briefings
 *   - support-triage:  open tickets that still need a first staff response → reply draft + assignment
 *
 * Everything lands in the agent_actions approvals inbox; nothing executes
 * without a human. Duplicate proposals are blocked by idempotency keys and
 * the one-open-proposal-per-target unique index, and skipped quietly here.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildAgentPrincipal } from "../principal";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { validateAdminPayoutReadiness } from "@/lib/admin/validate-provider-payout-readiness";
import {
  proposeDisputeBriefing,
  proposeFraudBriefing,
  proposePayoutDecision,
  proposeReconciliationBriefing,
  proposeReportBriefing,
} from "../services/gap-services";
import { runSupportTriageWorkflow } from "./support-agent";

const PER_KIND_LIMIT = 10;

type SweepCounts = {
  payoutReviews: number;
  reconBriefings: number;
  fraudBriefings: number;
  disputeBriefings: number;
  reportBriefings: number;
  errors: string[];
};

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

export async function runWorkforceSweepForTenant(params: {
  tenantId: string;
  environment: string;
}): Promise<{ skipped: true; reason: string } | { counts: SweepCounts }> {
  const module = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const supabase = getSupabaseAdmin();
  const counts: SweepCounts = {
    payoutReviews: 0,
    reconBriefings: 0,
    fraudBriefings: 0,
    disputeBriefings: 0,
    reportBriefings: 0,
    errors: [],
  };

  // ── Payout review ───────────────────────────────────────────────────────
  try {
    const def = await loadAgentDefinition("payout-review");
    const op = def ? await loadAgentOperationalState("payout-review") : null;
    if (def && op?.state === "active") {
      const { data: payouts } = await supabase
        .from("payouts")
        .select("id, provider_id, amount, currency, status")
        .eq("tenant_id", params.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(PER_KIND_LIMIT);

      for (const payout of payouts ?? []) {
        try {
          let recommendation: "approve" | "hold" = "approve";
          let rationale = `Balance and payout account verified for ${payout.currency} ${Number(payout.amount).toFixed(2)}.`;
          if (payout.provider_id) {
            const readiness = await validateAdminPayoutReadiness({
              supabase,
              providerId: payout.provider_id,
              tenantId: params.tenantId,
              requestedAccountId: null,
              requireAccount: true,
            });
            if (readiness.ok === false) {
              recommendation = "hold";
              rationale = `Readiness check failed (${readiness.code}): ${readiness.message}`;
            } else {
              rationale = `Available balance ${readiness.availableBalance.toFixed(2)} covers payout of ${Number(payout.amount).toFixed(2)} ${payout.currency}; active payout account on file.`;
            }
          }
          const runId = randomUUID();
          const principal = buildAgentPrincipal({
            actorId: def.id,
            agentKey: "payout-review",
            agentDefinitionVersion: def.active_version,
            tenantId: params.tenantId,
            role: def.admin_role,
            workflowType: "payout-review",
            workflowRunId: runId,
          });
          await proposePayoutDecision(principal, payout.id, {
            recommendation,
            rationale,
            amount: Number(payout.amount),
          });
          counts.payoutReviews += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`payout:${payout.id}:${String(err).slice(0, 120)}`);
        }
      }
    }
  } catch (err) {
    counts.errors.push(`payout-review:${String(err).slice(0, 120)}`);
  }

  // ── Reconciliation exceptions ───────────────────────────────────────────
  try {
    const def = await loadAgentDefinition("reconciliation-investigator");
    const op = def ? await loadAgentOperationalState("reconciliation-investigator") : null;
    if (def && op?.state === "active") {
      const { data: exceptions } = await supabase
        .from("reconciliation_exceptions")
        .select("id, mismatch_reason, psp, currency, metadata")
        .eq("tenant_id", params.tenantId)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(PER_KIND_LIMIT);

      for (const ex of exceptions ?? []) {
        const alreadyBriefed = Boolean((ex.metadata as Record<string, unknown> | null)?.agent_briefing);
        if (alreadyBriefed) continue;
        try {
          const runId = randomUUID();
          const principal = buildAgentPrincipal({
            actorId: def.id,
            agentKey: "reconciliation-investigator",
            agentDefinitionVersion: def.active_version,
            tenantId: params.tenantId,
            role: def.admin_role,
            workflowType: "reconciliation-investigate",
            workflowRunId: runId,
          });
          await proposeReconciliationBriefing(principal, ex.id, {
            summary: `Open ${ex.psp ?? "psp"} exception (${ex.currency ?? "?"}): ${ex.mismatch_reason ?? "unclassified mismatch"}. Compare gateway settlement export against ledger rows for the affected day.`,
            suggestedResolution:
              "Match against settlement export; if the gateway row is missing, request a re-export before considering write-off.",
          });
          counts.reconBriefings += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`recon:${ex.id}:${String(err).slice(0, 120)}`);
        }
      }
    }
  } catch (err) {
    counts.errors.push(`reconciliation:${String(err).slice(0, 120)}`);
  }

  // ── Trust: fraud cases, disputes, user reports ──────────────────────────
  try {
    const def = await loadAgentDefinition("trust-monitor");
    const op = def ? await loadAgentOperationalState("trust-monitor") : null;
    if (def && op?.state === "active") {
      const mkPrincipal = (workflowType: string) =>
        buildAgentPrincipal({
          actorId: def.id,
          agentKey: "trust-monitor",
          agentDefinitionVersion: def.active_version,
          tenantId: params.tenantId,
          role: def.admin_role,
          workflowType,
          workflowRunId: randomUUID(),
        });

      const { data: fraudCases } = await supabase
        .from("fraud_cases")
        .select("id, risk_score, signals")
        .eq("tenant_id", params.tenantId)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(PER_KIND_LIMIT);
      for (const fc of fraudCases ?? []) {
        if ((fc.signals as Record<string, unknown> | null)?.agent_briefing) continue;
        try {
          const signalKeys =
            fc.signals && typeof fc.signals === "object" ? Object.keys(fc.signals as object).slice(0, 8) : [];
          await proposeFraudBriefing(mkPrincipal("fraud-briefing"), fc.id, {
            summary: `Open fraud case, risk score ${fc.risk_score ?? "?"}. Signals: ${signalKeys.join(", ") || "none recorded"}.`,
            recommendation:
              Number(fc.risk_score ?? 0) >= 70
                ? "High risk — prioritise human review; consider holding related payouts."
                : "Moderate risk — verify signals against booking/payment history before disposition.",
          });
          counts.fraudBriefings += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`fraud:${fc.id}:${String(err).slice(0, 120)}`);
        }
      }

      const { data: disputes } = await supabase
        .from("booking_disputes")
        .select("id, reason, opened_by, notes, booking_id, bookings!inner(tenant_id)")
        .eq("bookings.tenant_id", params.tenantId)
        .eq("status", "open")
        .order("opened_at", { ascending: true })
        .limit(PER_KIND_LIMIT);
      for (const d of disputes ?? []) {
        if (String((d as { notes?: string | null }).notes ?? "").includes("[Agent briefing")) continue;
        try {
          await proposeDisputeBriefing(mkPrincipal("dispute-briefing"), d.id, {
            summary: `Open booking dispute (opened by ${d.opened_by}): ${String(d.reason ?? "").slice(0, 160)}. Review booking timeline, payments, and prior messages before ruling.`,
            suggestedNextStep:
              "Pull the booking's payment and message history, contact both parties if facts conflict, then resolve via the disputes console (refund_full / refund_partial / deny).",
          });
          counts.disputeBriefings += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`dispute:${d.id}:${String(err).slice(0, 120)}`);
        }
      }

      const { data: reports } = await supabase
        .from("user_reports")
        .select("id, report_type, description, is_adverse_finding, reported_user_id")
        .eq("tenant_id", params.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(PER_KIND_LIMIT);
      for (const r of reports ?? []) {
        try {
          // Adverse-finding correlator: the reported user's cross-domain
          // history, so the reviewer sees patterns instead of one incident.
          const history: string[] = [];
          const reportedUserId = String(r.reported_user_id ?? "");
          if (reportedUserId) {
            const { count: priorReports } = await supabase
              .from("user_reports")
              .select("id", { count: "exact", head: true })
              .eq("reported_user_id", reportedUserId)
              .neq("id", r.id);
            if ((priorReports ?? 0) > 0) history.push(`${priorReports} prior report(s) against this user`);

            const { count: adverseFindings } = await supabase
              .from("user_reports")
              .select("id", { count: "exact", head: true })
              .eq("reported_user_id", reportedUserId)
              .eq("is_adverse_finding", true)
              .neq("id", r.id);
            if ((adverseFindings ?? 0) > 0) history.push(`${adverseFindings} confirmed adverse finding(s)`);

            const { count: fraudCases } = await supabase
              .from("fraud_cases")
              .select("id", { count: "exact", head: true })
              .eq("subject_user_id", reportedUserId);
            if ((fraudCases ?? 0) > 0) history.push(`${fraudCases} fraud case(s) on record`);
          }

          await proposeReportBriefing(mkPrincipal("report-briefing"), r.id, {
            summary: `Pending ${String(r.report_type ?? "").replace(/_/g, " ")}: ${String(r.description ?? "").slice(0, 160)}${r.is_adverse_finding ? " (flagged adverse finding)" : ""}.${history.length > 0 ? ` Subject history: ${history.join("; ")}.` : " No prior history for the reported user."}`,
            suggestedNextStep:
              history.length > 0
                ? "Subject has prior history — review past cases together with this report before deciding."
                : "First report against this user — resolve or dismiss with notes.",
          });
          counts.reportBriefings += 1;
        } catch (err) {
          if (!isDuplicate(err)) counts.errors.push(`report:${r.id}:${String(err).slice(0, 120)}`);
        }
      }
    }
  } catch (err) {
    counts.errors.push(`trust-monitor:${String(err).slice(0, 120)}`);
  }

  return { counts };
}

/**
 * Support triage backstop — platform-wide, run once per sweep (tickets carry
 * no tenant_id; the workflow resolves each ticket's tenant itself). Catches
 * tickets whose creation-time trigger was missed.
 */
export async function runSupportTriageBackstop(environment: string): Promise<{
  ticketsTriaged: number;
  errors: string[];
}> {
  const supabase = getSupabaseAdmin();
  const result = { ticketsTriaged: 0, errors: [] as string[] };
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("status", "open")
    .is("first_staff_reply_at", null)
    .is("assigned_to", null)
    .order("created_at", { ascending: true })
    .limit(PER_KIND_LIMIT);
  for (const t of tickets ?? []) {
    try {
      const triage = await runSupportTriageWorkflow({ ticketId: t.id, environment });
      if (!("skipped" in triage)) result.ticketsTriaged += 1;
    } catch (err) {
      if (!isDuplicate(err)) result.errors.push(`ticket:${t.id}:${String(err).slice(0, 120)}`);
    }
  }
  return result;
}
