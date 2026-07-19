/**
 * Support agent triage workflow.
 *
 * On every new ticket (event trigger + cron sweep) the agent:
 *   1. Classifies the ticket (LLM when Gemini is configured, deterministic heuristics otherwise).
 *   2. Detects escalation signals that REQUIRE a human (refunds, disputes, legal, safety, anger).
 *   3. Drafts a customer reply — proposed as a `support.reply` action; a human support
 *      agent must approve before anything is sent to the customer. Never auto-sends.
 *   4. Proposes assignment (`support.assign`) to the least-loaded support staffer.
 *
 * All side effects flow through the agent_actions approval pipeline.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentDefinition, loadAgentModuleConfig, loadAgentOperationalState } from "../config-loader";
import { assertAgentReadAllowed } from "../safety-gate";
import { proposeAgentAction } from "../actions/action-service";
import { resolveSupportTicketTenantId } from "../support-ticket-tenant";
import { fetchSupportTicketContext, type SupportTicketContextFacts } from "../support-context";
import { callAgentLlm, parseLlmJson } from "../llm";
import { hashPayload } from "@beautonomi/agent-policy";

export type SupportTriageClassification = {
  category: string;
  urgency: "low" | "medium" | "high" | "urgent";
  sentiment: "positive" | "neutral" | "negative";
  needsHuman: boolean;
  escalationReasons: string[];
  source: "llm" | "heuristic";
};

const ESCALATION_KEYWORDS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /refund|money back|charge(d)? twice|double charge/i, reason: "refund_or_billing" },
  { pattern: /dispute|chargeback/i, reason: "payment_dispute" },
  { pattern: /legal|lawyer|attorney|sue|lawsuit|ombudsman/i, reason: "legal_threat" },
  { pattern: /fraud|scam|stolen|unauthori[sz]ed|hacked/i, reason: "fraud_or_security" },
  { pattern: /injur|burn|allerg|rash|infection|hospital|unsafe/i, reason: "safety_incident" },
  { pattern: /harass|assault|threat|abuse|discriminat/i, reason: "trust_and_safety" },
  { pattern: /delete my (account|data)|gdpr|popia/i, reason: "privacy_request" },
  { pattern: /furious|outraged|disgusted|unacceptable|worst|never again/i, reason: "high_negative_sentiment" },
];

/** Deterministic fallback classification when no LLM is configured. */
export function classifySupportTicketHeuristically(ticket: {
  subject: string;
  description: string;
  priority?: string | null;
  category?: string | null;
}): SupportTriageClassification {
  const text = `${ticket.subject}\n${ticket.description}`;
  const escalationReasons = ESCALATION_KEYWORDS.filter((k) => k.pattern.test(text)).map((k) => k.reason);
  const priorityUrgent = ticket.priority === "urgent" || ticket.priority === "high";
  if (priorityUrgent) escalationReasons.push("customer_marked_high_priority");

  const negative = escalationReasons.includes("high_negative_sentiment");
  return {
    category: ticket.category ?? "general",
    urgency: ticket.priority === "urgent" ? "urgent" : priorityUrgent || escalationReasons.length > 0 ? "high" : "medium",
    sentiment: negative ? "negative" : "neutral",
    needsHuman: escalationReasons.length > 0,
    escalationReasons: [...new Set(escalationReasons)],
    source: "heuristic",
  };
}

export function buildFallbackReplyDraft(params: {
  customerName: string | null;
  ticketNumber: string;
  subject: string;
  needsHuman: boolean;
}): string {
  const greeting = params.customerName ? `Hi ${params.customerName},` : "Hi there,";
  const escalationLine = params.needsHuman
    ? "Because of the nature of your request, a member of our support team is personally reviewing it and will follow up with you shortly."
    : "Our support team is looking into this and will get back to you as soon as possible.";
  return [
    greeting,
    "",
    `Thank you for contacting Beautonomi support about "${params.subject}" (ticket ${params.ticketNumber}).`,
    escalationLine,
    "",
    "If you have any additional details or screenshots that could help, just reply to this ticket.",
    "",
    "Warm regards,",
    "Beautonomi Support",
  ].join("\n");
}

type LlmTriageOutput = {
  category?: string;
  urgency?: string;
  sentiment?: string;
  needs_human?: boolean;
  escalation_reasons?: string[];
  reply_draft?: string;
};

const LLM_TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string" },
    urgency: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    needs_human: { type: "boolean" },
    escalation_reasons: { type: "array", items: { type: "string" } },
    reply_draft: { type: "string" },
  },
  required: ["category", "urgency", "sentiment", "needs_human", "reply_draft"],
};

async function classifyAndDraftWithLlm(ticket: {
  subject: string;
  description: string;
  priority?: string | null;
  category?: string | null;
  ticketNumber: string;
  customerName: string | null;
  context?: SupportTicketContextFacts | null;
}): Promise<{ classification: SupportTriageClassification; replyDraft: string } | null> {
  const llm = await callAgentLlm({
    system: [
      "You are the support triage agent for Beautonomi, a beauty-services marketplace (bookings, payments, gift cards, memberships).",
      "Classify the ticket and draft a warm, professional first reply to the customer.",
      "Rules:",
      "- NEVER promise refunds, credits, compensation, or specific outcomes — a human decides those.",
      "- If the ticket involves money movement, refunds, disputes, fraud, legal threats, safety incidents, or an angry customer, set needs_human=true and say a specialist is personally reviewing it.",
      "- Do not invent order/booking details. You MAY reference the verified_context facts (they come from our database and belong to this customer) to make the reply specific — e.g. cite the booking number, its status, or a refund that already completed.",
      "- Reply in the customer's language if obvious, otherwise English.",
      "Return ONLY JSON matching the schema.",
    ].join("\n"),
    user: JSON.stringify({
      subject: ticket.subject,
      message: ticket.description.slice(0, 4000),
      customer_priority: ticket.priority ?? "medium",
      customer_category: ticket.category ?? null,
      ticket_number: ticket.ticketNumber,
      customer_first_name: ticket.customerName,
      verified_context: ticket.context ?? null,
    }),
    schema: LLM_TRIAGE_SCHEMA,
    maxTokens: 900,
  });

  if (!llm.configured || llm.success !== true) return null;
  const parsed = parseLlmJson<LlmTriageOutput>(llm.text);
  if (!parsed || typeof parsed.reply_draft !== "string" || !parsed.reply_draft.trim()) return null;

  // The heuristic escalation check is a hard floor: the LLM may add escalations
  // but can never clear one (safety property).
  const heuristic = classifySupportTicketHeuristically(ticket);
  const needsHuman = Boolean(parsed.needs_human) || heuristic.needsHuman;
  const urgencyValues = ["low", "medium", "high", "urgent"] as const;
  const urgency = urgencyValues.includes(parsed.urgency as never)
    ? (parsed.urgency as SupportTriageClassification["urgency"])
    : heuristic.urgency;
  const sentimentValues = ["positive", "neutral", "negative"] as const;
  const sentiment = sentimentValues.includes(parsed.sentiment as never)
    ? (parsed.sentiment as SupportTriageClassification["sentiment"])
    : heuristic.sentiment;

  return {
    classification: {
      category: parsed.category?.trim() || heuristic.category,
      urgency,
      sentiment,
      needsHuman,
      escalationReasons: [
        ...new Set([...(parsed.escalation_reasons ?? []), ...heuristic.escalationReasons]),
      ],
      source: "llm",
    },
    replyDraft: parsed.reply_draft.trim(),
  };
}

/** Pick the support staffer with the fewest open assigned tickets. */
async function pickLeastLoadedAssignee(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data: staff } = await supabase
    .from("users")
    .select("id")
    .in("role", ["support_agent", "admin_support"])
    .limit(50);
  const candidates = (staff ?? []).map((s: { id: string }) => s.id);
  if (candidates.length === 0) return null;

  const { data: openTickets } = await supabase
    .from("support_tickets")
    .select("assigned_to")
    .in("assigned_to", candidates)
    .in("status", ["open", "in_progress", "waiting_customer"]);

  const load = new Map<string, number>(candidates.map((c) => [c, 0]));
  for (const row of (openTickets ?? []) as Array<{ assigned_to: string | null }>) {
    if (row.assigned_to && load.has(row.assigned_to)) {
      load.set(row.assigned_to, (load.get(row.assigned_to) ?? 0) + 1);
    }
  }
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

export async function runSupportTriageWorkflow(params: {
  ticketId: string;
  /** Optional — resolved from the ticket's provider (or ZA default) when omitted. */
  tenantId?: string | null;
  environment?: string;
}): Promise<
  | { skipped: true; reason: string }
  | {
      runId: string;
      classification: SupportTriageClassification;
      proposals: Array<{ type: string; actionId: string | null; skipped?: string }>;
      shadowMode: boolean;
    }
> {
  const module = await loadAgentModuleConfig(params.environment);
  const gate = assertAgentReadAllowed({ masterEnabled: module.masterEnabled });
  if (!gate.allowed) return { skipped: true, reason: gate.reason ?? "gated" };

  const def = await loadAgentDefinition("support-triage");
  if (!def) return { skipped: true, reason: "support_triage_not_configured" };
  const op = await loadAgentOperationalState("support-triage");
  if (op.state !== "active") return { skipped: true, reason: "agent_not_active" };

  const supabase = getSupabaseAdmin();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, description, status, priority, category, provider_id, user_id, assigned_to, requester_type, support_context_type, support_context_id",
    )
    .eq("id", params.ticketId)
    .maybeSingle();
  if (!ticket) return { skipped: true, reason: "ticket_not_found" };
  if (!["open", "in_progress"].includes(String(ticket.status))) {
    return { skipped: true, reason: `ticket_status_${ticket.status}` };
  }

  const tenantId = params.tenantId ?? (await resolveSupportTicketTenantId(supabase, ticket));
  if (!tenantId) return { skipped: true, reason: "tenant_unresolved" };

  const { data: customer } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", ticket.user_id)
    .maybeSingle();
  const customerName =
    (customer as { full_name?: string | null } | null)?.full_name?.trim().split(/\s+/)[0] ?? null;

  const runId = randomUUID();
  await supabase.from("agent_runs").insert({
    id: runId,
    tenant_id: tenantId,
    agent_id: def.id,
    agent_version: def.active_version,
    workflow_type: "support-triage",
    workflow_run_id: runId,
    trigger_kind: "event",
    status: "running",
    shadow_mode: module.shadowMode,
  });

  const context = await fetchSupportTicketContext(supabase, ticket).catch(() => null);

  const ticketInput = {
    subject: String(ticket.subject ?? ""),
    description: String(ticket.description ?? ""),
    priority: ticket.priority as string | null,
    category: ticket.category as string | null,
    ticketNumber: String(ticket.ticket_number ?? ticket.id),
    customerName,
    context,
  };

  let classification: SupportTriageClassification;
  let replyDraft: string;
  const llmResult = await classifyAndDraftWithLlm(ticketInput).catch(() => null);
  if (llmResult) {
    classification = llmResult.classification;
    replyDraft = llmResult.replyDraft;
  } else {
    classification = classifySupportTicketHeuristically(ticketInput);
    replyDraft = buildFallbackReplyDraft({
      customerName,
      ticketNumber: ticketInput.ticketNumber,
      subject: ticketInput.subject,
      needsHuman: classification.needsHuman,
    });
  }

  const proposals: Array<{ type: string; actionId: string | null; skipped?: string }> = [];

  // 1. Reply draft — human approval required before it reaches the customer.
  try {
    const replyPayload = {
      ticketId: ticket.id,
      draftReply: replyDraft,
      classification,
      needsHuman: classification.needsHuman,
      escalationReasons: classification.escalationReasons,
      // Shown to the approver so they can verify every fact the draft cites.
      verifiedContext: context,
    };
    const action = await proposeAgentAction({
      tenantId,
      agentId: def.id,
      workflowRunId: runId,
      actionType: "support.reply",
      targetType: "support_ticket",
      targetId: String(ticket.id),
      proposedPayload: replyPayload,
      reasoningSummary: classification.needsHuman
        ? `Escalation required (${classification.escalationReasons.join(", ")}). Draft acknowledges human review; approve to send.`
        : `Routine ${classification.category} ticket (${classification.urgency}). Approve to send the drafted first reply.`,
      riskLevel: 1,
      policyVersion: def.active_version,
      promptVersion: classification.source,
      idempotencyKey: `support-reply:${ticket.id}:${hashPayload(replyPayload).slice(0, 16)}`,
    });
    proposals.push({ type: "support.reply", actionId: action.id });
  } catch (err) {
    proposals.push({
      type: "support.reply",
      actionId: null,
      skipped: isDuplicateProposal(err) ? "open_proposal_exists" : `error:${String(err).slice(0, 120)}`,
    });
  }

  // 2. Assignment — propose the least-loaded support staffer if unassigned.
  if (!ticket.assigned_to) {
    const assignee = await pickLeastLoadedAssignee();
    if (assignee) {
      try {
        const assignPayload = {
          ticketId: ticket.id,
          assigneeUserId: assignee,
          escalated: classification.needsHuman,
          rationale: classification.needsHuman
            ? `Escalation (${classification.escalationReasons.join(", ")}) — route to a human immediately.`
            : "Least-loaded support staffer.",
        };
        const action = await proposeAgentAction({
          tenantId,
          agentId: def.id,
          workflowRunId: runId,
          actionType: "support.assign",
          targetType: "support_ticket",
          targetId: String(ticket.id),
          proposedPayload: assignPayload,
          reasoningSummary: assignPayload.rationale,
          riskLevel: 1,
          policyVersion: def.active_version,
          idempotencyKey: `support-assign:${ticket.id}:${assignee}`,
        });
        proposals.push({ type: "support.assign", actionId: action.id });
      } catch (err) {
        proposals.push({
          type: "support.assign",
          actionId: null,
          skipped: isDuplicateProposal(err) ? "open_proposal_exists" : `error:${String(err).slice(0, 120)}`,
        });
      }
    }
  }

  await supabase
    .from("agent_runs")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      escalation_count: classification.needsHuman ? 1 : 0,
    })
    .eq("id", runId);

  return { runId, classification, proposals, shadowMode: module.shadowMode };
}

function isDuplicateProposal(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = String((err as { message?: string } | null)?.message ?? err ?? "");
  return code === "23505" || /duplicate|unique/i.test(message);
}
