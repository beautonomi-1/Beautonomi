import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { streamLlm } from "@/lib/ai/call-llm";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { logAiUsage } from "@/lib/ai/enforce-budget";
import { loadAgentDefinition, loadAgentOperationalState } from "@/lib/agents/config-loader";
import { classifySupportTicketHeuristically } from "@/lib/agents/workflows/support-agent";
import { fetchSupportTicketContext, listRequesterRecentSupportRecords } from "@/lib/agents/support-context";
import { categoryExpectsLinkableRecord } from "./categories";
import { resolveSupportTicketTenantId } from "@/lib/agents/support-ticket-tenant";
import { searchPublicKnowledgeForAssistant } from "./knowledge";
import { handoffSupportTicketToHuman } from "./handoff";
import { SUPPORT_ASSISTANT_AGENT_KEY } from "./availability";
import { tryAutoLinkSupportContextForAssistant } from "./context-link";
import { resolveReplyLocale, resolveUserPreferredLanguage } from "@/lib/agents/locale";
import { shouldEscalateAssistantForMessageLocale } from "./locale-escalation";

const ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
const ENVIRONMENT = ENV === "production" ? "production" : ENV === "staging" ? "staging" : "development";

/** Stream assistant reply tokens; persists the full message in onFinish. */
export async function createSupportAssistantTextStream(params: {
  admin: SupabaseClient;
  ticketId: string;
  userText: string;
  request?: NextRequest;
}) {
  const { data: ticket } = await params.admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, description, status, priority, category, provider_id, user_id, requester_type, support_context_type, support_context_id, support_context_label, handling_mode, channel",
    )
    .eq("id", params.ticketId)
    .maybeSingle();

  if (!ticket) throw new Error("NOT_FOUND");
  if (String(ticket.handling_mode ?? "human") !== "assistant") throw new Error("NOT_ASSISTANT");

  const op = await loadAgentOperationalState(SUPPORT_ASSISTANT_AGENT_KEY);
  const agentId = op.agentId;
  const def = await loadAgentDefinition(SUPPORT_ASSISTANT_AGENT_KEY);
  const tenantId = await resolveSupportTicketTenantId(params.admin, ticket);
  const audience =
    String(ticket.requester_type) === "provider" || ticket.provider_id ? "provider" : "customer";

  let recentRecords: Awaited<ReturnType<typeof listRequesterRecentSupportRecords>> = [];
  if (!ticket.support_context_id && categoryExpectsLinkableRecord(String(ticket.category ?? ""))) {
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
    if (refreshed) Object.assign(ticket, refreshed);
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
    throw new Error("LOCALE_ESCALATION");
  }

  const context = await fetchSupportTicketContext(params.admin, {
    user_id: ticket.user_id as string,
    provider_id: ticket.provider_id as string | null,
    support_context_type: ticket.support_context_type as string | null,
    support_context_id: ticket.support_context_id as string | null,
  });
  const kbHits = await searchPublicKnowledgeForAssistant(
    params.admin,
    params.userText.slice(0, 200) || String(ticket.subject ?? ""),
    audience,
  );
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

  const system = `You are Beautonomi's support assistant. Reply in plain text only (no JSON). Be concise. Never promise refunds or account deletion. Use verified facts and public help articles only.${
    replyLocale !== "en" ? ` Write in ${replyLocale}.` : ""
  }`;

  const user = JSON.stringify({
    ticket_number: ticket.ticket_number,
    category: ticket.category,
    verified_facts: context?.facts ?? null,
    public_articles: kbHits.map((h) => ({ title: h.title, slug: h.slug })),
    customer_message: params.userText,
  });

  let streamResult: Awaited<ReturnType<typeof streamLlm>>;
  try {
    streamResult = await streamLlm({
    system,
    user,
    featureKey: "support.ai_assistant",
    task: "drafting",
    tenantId,
    maxTokens: 800,
    maxCostUsd: def?.max_cost_usd_per_run != null ? Number(def.max_cost_usd_per_run) : 0.25,
    environment: ENVIRONMENT,
    onFinish: async (finish) => {
      const replyText =
        finish.text.trim() ||
        "Thanks for your message. I'm connecting you to our support team for the next step.";
      const needsHuman = heuristic.needsHuman;
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
      if (!insertErr && assistantRow) {
        await params.admin
          .from("support_tickets")
          .update({
            last_message_at: assistantRow.created_at ?? now,
            last_message_from: "assistant",
            updated_at: now,
          })
          .eq("id", params.ticketId);
      }
      await params.admin.from("agent_runs").update({ status: "succeeded" }).eq("id", runId);
      const costUsd = await estimateCostUsd(finish.model, finish.tokensIn, finish.tokensOut);
      await logAiUsage({
        actor_user_id: null,
        agent_id: agentId,
        provider_id: null,
        feature_key: "support.ai_assistant",
        model: finish.model,
        tokens_in: finish.tokensIn,
        tokens_out: finish.tokensOut,
        cost_estimate: costUsd,
        success: true,
        error_code: null,
        tenant_id: tenantId,
        model_provider: finish.modelProvider,
        runtime: finish.runtime,
        gateway: finish.gateway,
        latency_ms: null,
        fallback_used: false,
        breaker_tripped: false,
      });
      if (needsHuman) {
        await handoffSupportTicketToHuman({
          admin: params.admin,
          ticketId: params.ticketId,
          request: params.request,
          reason: heuristic.escalationReasons.join(", ") || "needs_human",
        });
      }
    },
  });
  } catch (err) {
    await params.admin.from("agent_runs").update({ status: "retryable_failure" }).eq("id", runId);
    throw err;
  }

  return streamResult;
}
