/**
 * Support follow-up sweep — the "team lead" work that keeps a queue healthy:
 *
 *   1. Stale waiting_customer tickets (staff replied, customer silent 48h+)
 *      → propose a polite nudge (`support.reply`); after 7+ days of silence,
 *        propose closing the loop (`support.resolve`).
 *   2. SLA-breached open tickets → propose urgent assignment (`support.assign`).
 *   3. Low CSAT scores (≤ 2) submitted in the last 7 days → propose a recovery
 *      reply and flag for a human.
 *
 * Platform-wide (tickets carry no tenant_id; each ticket resolves its own
 * tenant). Everything is proposal-only.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";
import { resolveSupportTicketTenantId } from "../support-ticket-tenant";

const PER_KIND_LIMIT = 15;
const NUDGE_AFTER_MS = 48 * 3600_000;
const RESOLVE_AFTER_MS = 7 * 24 * 3600_000;

export type SupportFollowUpCounts = {
  nudges: number;
  resolveProposals: number;
  slaEscalations: number;
  csatRecoveries: number;
  errors: string[];
};

function isDuplicate(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}

export function buildNudgeDraft(params: { ticketNumber: string; daysSinceReply: number }): string {
  return [
    "Hi there,",
    "",
    `Just checking in on ticket ${params.ticketNumber} — we replied ${params.daysSinceReply} day(s) ago and want to make sure you saw it.`,
    "If our answer solved the problem, no action is needed and we'll close the ticket shortly. If you still need help, just reply here and we'll pick it right back up.",
    "",
    "Warm regards,",
    "Beautonomi Support",
  ].join("\n");
}

export function buildCsatRecoveryDraft(params: { ticketNumber: string; customerName: string | null }): string {
  const greeting = params.customerName ? `Hi ${params.customerName},` : "Hi there,";
  return [
    greeting,
    "",
    `Thank you for your honest feedback on ticket ${params.ticketNumber}. I'm sorry the experience fell short of what you deserve.`,
    "A senior member of our support team is personally reviewing what happened, and we'd genuinely like to make this right. If there's anything specific we missed, please tell us here — it goes straight to the person handling your case.",
    "",
    "Warm regards,",
    "Beautonomi Support",
  ].join("\n");
}

export async function runSupportFollowUpSweep(environment?: string): Promise<
  { skipped: true; reason: string } | { counts: SupportFollowUpCounts }
> {
  const module = await loadAgentModuleConfig(environment);
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("support-triage");
  if (!def) return { skipped: true, reason: "support_triage_not_configured" };
  const op = await loadAgentOperationalState("support-triage");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  const counts: SupportFollowUpCounts = {
    nudges: 0,
    resolveProposals: 0,
    slaEscalations: 0,
    csatRecoveries: 0,
    errors: [],
  };
  const now = Date.now();

  const propose = async (input: {
    ticket: { id: string; provider_id?: string | null };
    actionType: string;
    payload: Record<string, unknown>;
    reasoning: string;
    idempotencyKey: string;
    counterKey: keyof Omit<SupportFollowUpCounts, "errors">;
  }) => {
    try {
      const tenantId = await resolveSupportTicketTenantId(supabase, input.ticket);
      if (!tenantId) return;
      await proposeAgentAction({
        tenantId,
        agentId: def.id,
        actionType: input.actionType,
        targetType: "support_ticket",
        targetId: input.ticket.id,
        proposedPayload: input.payload,
        reasoningSummary: input.reasoning,
        riskLevel: 1,
        policyVersion: def.active_version,
        idempotencyKey: input.idempotencyKey,
      });
      counts[input.counterKey] += 1;
    } catch (err) {
      if (!isDuplicate(err)) {
        counts.errors.push(`${input.actionType}:${input.ticket.id}:${String(err).slice(0, 120)}`);
      }
    }
  };

  // ── 1. Stale waiting_customer: nudge, then propose resolution ───────────
  const { data: stale } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, provider_id, last_message_at, last_message_from")
    .eq("status", "waiting_customer")
    .eq("last_message_from", "staff")
    .lt("last_message_at", new Date(now - NUDGE_AFTER_MS).toISOString())
    .order("last_message_at", { ascending: true })
    .limit(PER_KIND_LIMIT);

  for (const t of stale ?? []) {
    const silentMs = now - new Date(String(t.last_message_at)).getTime();
    const days = Math.floor(silentMs / (24 * 3600_000));
    const ticketNumber = String(t.ticket_number ?? t.id);
    if (silentMs >= RESOLVE_AFTER_MS) {
      await propose({
        ticket: t,
        actionType: "support.resolve",
        payload: { ticketId: t.id, reason: `No customer response for ${days} days after staff reply.` },
        reasoning: `Customer silent for ${days} days after our reply — approve to resolve the ticket (customer can always reopen by replying).`,
        idempotencyKey: `support-resolve:${t.id}`,
        counterKey: "resolveProposals",
      });
    } else {
      await propose({
        ticket: t,
        actionType: "support.reply",
        payload: {
          ticketId: t.id,
          draftReply: buildNudgeDraft({ ticketNumber, daysSinceReply: Math.max(days, 2) }),
          followUpKind: "stale_waiting_customer",
        },
        reasoning: `Waiting on the customer for ${days} day(s) — approve to send a friendly check-in.`,
        idempotencyKey: `support-nudge:${t.id}:${String(t.last_message_at)}`,
        counterKey: "nudges",
      });
    }
  }

  // ── 2. SLA breach: escalate to the least-loaded staffer, marked urgent ──
  const { data: breached } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, provider_id, assigned_to, sla_resolution_due_at, priority")
    .in("status", ["open", "in_progress"])
    .lt("sla_resolution_due_at", new Date(now).toISOString())
    .order("sla_resolution_due_at", { ascending: true })
    .limit(PER_KIND_LIMIT);

  const { data: staff } = await supabase
    .from("users")
    .select("id")
    .in("role", ["support_agent", "admin_support"])
    .limit(50);
  const staffIds = (staff ?? []).map((s: { id: string }) => s.id);

  // Least-loaded assignee across open tickets (same idea as triage).
  let leastLoadedAssignee: string | null = null;
  if (staffIds.length > 0) {
    const { data: openAssigned } = await supabase
      .from("support_tickets")
      .select("assigned_to")
      .in("status", ["open", "in_progress", "waiting_customer"])
      .in("assigned_to", staffIds)
      .limit(500);
    const load = new Map<string, number>(staffIds.map((id) => [id, 0]));
    for (const row of openAssigned ?? []) {
      const id = String((row as { assigned_to?: string }).assigned_to ?? "");
      if (load.has(id)) load.set(id, (load.get(id) ?? 0) + 1);
    }
    leastLoadedAssignee = [...load.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? staffIds[0];
  }

  for (const t of breached ?? []) {
    if (!leastLoadedAssignee) break;
    // Already with support staff — leave alone (human owns the SLA breach).
    if (t.assigned_to && staffIds.includes(String(t.assigned_to))) continue;
    await propose({
      ticket: t,
      actionType: "support.assign",
      payload: {
        ticketId: t.id,
        assigneeUserId: leastLoadedAssignee,
        escalated: true,
        rationale: `Resolution SLA breached (due ${t.sla_resolution_due_at}); ticket is ${t.assigned_to ? "assigned outside the support team" : "unassigned"}.`,
      },
      reasoning: `SLA breach on ${String(t.ticket_number ?? t.id)} (priority ${t.priority ?? "medium"}) — approve to route it to the least-loaded support staffer now.`,
      idempotencyKey: `support-sla:${t.id}`,
      counterKey: "slaEscalations",
    });
  }

  // ── 3. CSAT recovery: low scores in the last 7 days ─────────────────────
  const { data: lowCsat } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, provider_id, user_id, csat_score, csat_submitted_at")
    .lte("csat_score", 2)
    .gte("csat_submitted_at", new Date(now - 7 * 24 * 3600_000).toISOString())
    .order("csat_submitted_at", { ascending: false })
    .limit(PER_KIND_LIMIT);

  for (const t of lowCsat ?? []) {
    const { data: customer } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", t.user_id)
      .maybeSingle();
    const firstName =
      (customer as { full_name?: string | null } | null)?.full_name?.trim().split(/\s+/)[0] ?? null;
    await propose({
      ticket: t,
      actionType: "support.reply",
      payload: {
        ticketId: t.id,
        draftReply: buildCsatRecoveryDraft({
          ticketNumber: String(t.ticket_number ?? t.id),
          customerName: firstName,
        }),
        followUpKind: "csat_recovery",
        needsHuman: true,
      },
      reasoning: `Customer rated this ticket ${t.csat_score}/5 — approve to send a recovery message; a human should own the follow-through.`,
      idempotencyKey: `csat-recovery:${t.id}`,
      counterKey: "csatRecoveries",
    });
  }

  return { counts };
}
