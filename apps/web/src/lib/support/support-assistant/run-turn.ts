import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAgentLlm, parseLlmJson } from "@/lib/agents/llm";
import { loadAgentDefinition } from "@/lib/agents/config-loader";
import { classifySupportTicketHeuristically } from "@/lib/agents/workflows/support-agent";
import { fetchSupportTicketContext, listRequesterRecentSupportRecords } from "@/lib/agents/support-context";
import { categoryExpectsLinkableRecord } from "./categories";
import { resolveSupportTicketTenantId } from "@/lib/agents/support-ticket-tenant";
import { searchPublicKnowledgeForAssistant, SUPPORT_CANCELLATION_WALLET_FACTS } from "./knowledge";
import { handoffSupportTicketToHuman } from "./handoff";
import { SUPPORT_ASSISTANT_AGENT_KEY } from "./availability";
import { tryAutoLinkSupportContextForAssistant } from "./context-link";
import { shouldEscalateAssistantForMessageLocale } from "./locale-escalation";
import { resolveReplyLocale, resolveUserPreferredLanguage } from "@/lib/agents/locale";
import { precheckSupportAssistantTurn } from "./turn-precheck";
import type { NextRequest } from "next/server";

type AssistantLlmOutput = {
  reply?: string;
  needs_human?: boolean;
  escalation_reasons?: string[];
  link_booking_number?: string;
  link_order_number?: string;
};

export type { RunAssistantTurnResult } from "./turn-precheck";
import type { RunAssistantTurnResult } from "./turn-precheck";

export async function runSupportAssistantTurn(params: {
  admin: SupabaseClient;
  ticketId: string;
  userText: string;
  request?: NextRequest;
}): Promise<RunAssistantTurnResult> {
  const pre = await precheckSupportAssistantTurn({
    admin: params.admin,
    ticketId: params.ticketId,
    request: params.request,
  });
  if (pre.ok === false) return pre.result;
  const ticket = pre.ticket;
  const agentId = pre.agentId;

  const def = await loadAgentDefinition(SUPPORT_ASSISTANT_AGENT_KEY);
  const tenantId = await resolveSupportTicketTenantId(params.admin, ticket);
  const audience =
    String(ticket.requester_type) === "provider" || ticket.provider_id ? "provider" : "customer";

  const kbQuery = params.userText.slice(0, 200) || String(ticket.subject ?? "");
  const kbHits = await searchPublicKnowledgeForAssistant(params.admin, kbQuery, audience);
  const cancellationTopic = /\b(cancel|cancellation|refund|wallet|no[- ]?show|late fee)\b/i.test(
    kbQuery,
  );

  let recentRecords: Awaited<ReturnType<typeof listRequesterRecentSupportRecords>> = [];
  if (
    !ticket.support_context_id &&
    categoryExpectsLinkableRecord(String(ticket.category ?? ""))
  ) {
    recentRecords = await listRequesterRecentSupportRecords(params.admin, {
      user_id: String(ticket.user_id),
      provider_id: ticket.provider_id as string | null,
    });
    await tryAutoLinkSupportContextForAssistant({
      admin: params.admin,
      ticketId: params.ticketId,
      ticket: {
        user_id: String(ticket.user_id),
        provider_id: ticket.provider_id as string | null,
        category: ticket.category as string | null,
        support_context_id: ticket.support_context_id as string | null,
      },
      userText: params.userText,
      recentRecords,
    });
    const { data: refreshed } = await params.admin
      .from("support_tickets")
      .select("support_context_type, support_context_id, support_context_label")
      .eq("id", params.ticketId)
      .maybeSingle();
    if (refreshed) {
      ticket.support_context_type = refreshed.support_context_type;
      ticket.support_context_id = refreshed.support_context_id;
      ticket.support_context_label = refreshed.support_context_label;
    }
  }

  const recipientLocale = await resolveUserPreferredLanguage(String(ticket.user_id ?? ""));
  const { data: agentLocaleRow } = await params.admin
    .from("agent_definitions")
    .select("reply_locale_mode")
    .eq("id", agentId)
    .maybeSingle();
  const replyLocale = resolveReplyLocale({
    replyLocaleMode: (agentLocaleRow as { reply_locale_mode?: string } | null)?.reply_locale_mode,
    recipientLocale,
  });
  if (shouldEscalateAssistantForMessageLocale({ userText: params.userText, replyLocale })) {
    await handoffSupportTicketToHuman({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
      reason: "Non-English message — specialist handoff (P4)",
    });
    return {
      ok: false,
      code: "LOCALE_ESCALATION",
      message: "Connecting you to a specialist who can help in your language.",
      handoff: true,
    };
  }

  const context = await fetchSupportTicketContext(params.admin, {
    user_id: ticket.user_id as string,
    provider_id: ticket.provider_id as string | null,
    support_context_type: ticket.support_context_type as string | null,
    support_context_id: ticket.support_context_id as string | null,
  });

  const heuristic = classifySupportTicketHeuristically({
    subject: String(ticket.subject ?? ""),
    description: `${String(ticket.description ?? "")}\n${params.userText}`,
    priority: ticket.priority as string | null,
    category: ticket.category as string | null,
  });

  const runId = randomUUID();
  await params.admin.from("agent_runs").insert({
    id: runId,
    tenant_id: tenantId,
    agent_id: agentId,
    agent_version: def?.active_version ?? "1",
    workflow_type: "support-assistant",
    workflow_run_id: runId,
    trigger_kind: "event",
    status: "running",
    shadow_mode: false,
    correlation_id: params.ticketId,
  });

  const system = `You are Beautonomi's support assistant on an existing ticket thread. Be concise, accurate, and never promise refunds, cancellations, payouts, or account deletion — offer to connect a human instead. Use verified facts and public help articles only. Never cite internal-only content.`;

  const userPayload = {
    ticket_number: ticket.ticket_number,
    category: ticket.category,
    support_context_type: ticket.support_context_type,
    support_context_label: ticket.support_context_label,
    verified_facts: context?.facts ?? null,
    recent_records: recentRecords.length ? recentRecords : null,
    public_articles: kbHits.map((h) => ({ title: h.title, slug: h.slug })),
    ...(cancellationTopic
      ? { cancellation_policy_facts: [...SUPPORT_CANCELLATION_WALLET_FACTS] }
      : {}),
    customer_message: params.userText,
    output_schema: {
      reply: "string — customer-visible message",
      needs_human: "boolean — true if a human must perform an action",
      escalation_reasons: "string[] optional",
      link_booking_number: "optional — when customer confirms a booking number to link",
      link_order_number: "optional — when customer confirms an order number to link",
    },
  };

  let replyText = "";
  let needsHuman = heuristic.needsHuman;

  try {
    const llm = await callAgentLlm({
      agentId,
      featureKey: "support.ai_assistant",
      task: "drafting",
      tenantId,
      recipientUserId: ticket.user_id as string,
      runId,
      system,
      user: JSON.stringify(userPayload),
      maxCostUsd: def?.max_cost_usd_per_run != null ? Number(def.max_cost_usd_per_run) : 0.25,
    });

    if (!llm.configured || llm.success !== true) {
      await params.admin.from("agent_runs").update({ status: "retryable_failure" }).eq("id", runId);
      await handoffSupportTicketToHuman({
        admin: params.admin,
        ticketId: params.ticketId,
        request: params.request,
        reason: "LLM unavailable",
      });
      return { ok: false, code: "LLM_FAILED", message: "Could not reach the assistant.", handoff: true };
    }

    const parsed = parseLlmJson<AssistantLlmOutput>(llm.text);
    replyText = String(parsed?.reply ?? "").trim();
    needsHuman = Boolean(parsed?.needs_human) || heuristic.needsHuman;
    if (!ticket.support_context_id && parsed) {
      await tryAutoLinkSupportContextForAssistant({
        admin: params.admin,
        ticketId: params.ticketId,
        ticket: {
          user_id: String(ticket.user_id),
          provider_id: ticket.provider_id as string | null,
          category: ticket.category as string | null,
          support_context_id: ticket.support_context_id as string | null,
        },
        userText: params.userText,
        llmHint: {
          link_booking_number: parsed.link_booking_number,
          link_order_number: parsed.link_order_number,
        },
        recentRecords,
      });
    }
  } catch (err) {
    console.error("Support assistant LLM error:", err);
    await params.admin.from("agent_runs").update({ status: "retryable_failure" }).eq("id", runId);
    await handoffSupportTicketToHuman({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
      reason: "LLM error",
    });
    return { ok: false, code: "LLM_ERROR", message: "Could not reach the assistant.", handoff: true };
  }

  if (!replyText) {
    replyText =
      "Thanks for your message. I need a specialist to help with this — I'm connecting you to our support team now.";
    needsHuman = true;
  }

  const now = new Date().toISOString();
  const { data: assistantRow, error: insertErr } = await params.admin
    .from("support_ticket_messages")
    .insert({
      ticket_id: params.ticketId,
      user_id: null,
      message: replyText.slice(0, 10000),
      is_internal: false,
      author_kind: "assistant",
    })
    .select()
    .single();

  if (insertErr) {
    await params.admin.from("agent_runs").update({ status: "retryable_failure" }).eq("id", runId);
    return { ok: false, code: "INSERT_FAILED", message: "Failed to save assistant reply" };
  }

  await params.admin
    .from("support_tickets")
    .update({
      last_message_at: assistantRow.created_at ?? now,
      last_message_from: "assistant",
      updated_at: now,
    })
    .eq("id", params.ticketId);

  await params.admin.from("agent_runs").update({ status: "succeeded" }).eq("id", runId);

  if (needsHuman) {
    await handoffSupportTicketToHuman({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
      reason: heuristic.escalationReasons.join(", ") || "needs_human",
    });
    return { ok: true, assistantMessage: assistantRow, handoff: true };
  }

  return { ok: true, assistantMessage: assistantRow, handoff: false };
}
