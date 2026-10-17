import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { loadAgentOperationalState } from "@/lib/agents/config-loader";
import { checkRateLimit } from "@/lib/rate-limit/store";
import { errorResponse } from "@/lib/supabase/api-helpers";
import { handoffSupportTicketToHuman } from "./handoff";
import { SUPPORT_ASSISTANT_AGENT_KEY } from "./availability";
export type RunAssistantTurnResult =
  | { ok: true; assistantMessage: Record<string, unknown>; handoff: boolean }
  | { ok: false; code: string; message: string; handoff?: boolean };

const ASSISTANT_RATE_LIMIT = {
  prefix: "support-assistant-turn",
  limit: 30,
  windowSeconds: 3600,
};

/** A run still "running" after this long was abandoned (stream aborted / function timeout). */
const IN_FLIGHT_STALE_MS = 2 * 60 * 1000;

export type SupportAssistantTicketRow = {
  id: string;
  ticket_number: string | null;
  subject: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  provider_id: string | null;
  user_id: string | null;
  requester_type: string | null;
  support_context_type: string | null;
  support_context_id: string | null;
  support_context_label: string | null;
  handling_mode: string | null;
  channel: string | null;
};

/** Shared gate before persisting a customer turn or starting LLM (stream or batch). */
export async function precheckSupportAssistantTurn(params: {
  admin: SupabaseClient;
  ticketId: string;
  request?: NextRequest;
}): Promise<
  | { ok: false; result: Extract<RunAssistantTurnResult, { ok: false }> }
  | { ok: true; ticket: SupportAssistantTicketRow; agentId: string }
> {
  const { data: ticket } = await params.admin
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, description, status, priority, category, provider_id, user_id, requester_type, support_context_type, support_context_id, support_context_label, handling_mode, channel",
    )
    .eq("id", params.ticketId)
    .maybeSingle();

  if (!ticket) {
    return { ok: false, result: { ok: false, code: "NOT_FOUND", message: "Ticket not found" } };
  }
  const row = ticket as SupportAssistantTicketRow;
  if (String(row.channel ?? "app") === "email") {
    return {
      ok: false,
      result: { ok: false, code: "EMAIL_CHANNEL", message: "Assistant not available on email tickets" },
    };
  }
  if (String(row.handling_mode ?? "human") !== "assistant") {
    return { ok: false, result: { ok: false, code: "NOT_ASSISTANT", message: "Ticket is not in assistant mode" } };
  }
  if (!["open", "in_progress", "waiting_customer"].includes(String(row.status))) {
    return { ok: false, result: { ok: false, code: "TICKET_CLOSED", message: "Ticket is closed" } };
  }

  const userId = String(row.user_id ?? "");
  const rate = await checkRateLimit(ASSISTANT_RATE_LIMIT, userId);
  if (!rate.allowed) {
    await handoffSupportTicketToHuman({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
      reason: "Rate limit exceeded",
    });
    return {
      ok: false,
      result: {
        ok: false,
        code: "RATE_LIMIT",
        message: "Too many messages; connecting you to support.",
        handoff: true,
      },
    };
  }

  const running = await params.admin
    .from("agent_runs")
    .select("id")
    .eq("workflow_type", "support-assistant")
    .eq("correlation_id", params.ticketId)
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - IN_FLIGHT_STALE_MS).toISOString())
    .limit(1);
  if ((running.data ?? []).length > 0) {
    return {
      ok: false,
      result: { ok: false, code: "IN_FLIGHT", message: "Please wait for the current reply." },
    };
  }

  let agentId: string;
  try {
    const op = await loadAgentOperationalState(SUPPORT_ASSISTANT_AGENT_KEY);
    agentId = op.agentId;
    if (op.state !== "active") {
      await handoffSupportTicketToHuman({
        admin: params.admin,
        ticketId: params.ticketId,
        request: params.request,
        reason: "Assistant not active",
      });
      return {
        ok: false,
        result: { ok: false, code: "AGENT_INACTIVE", message: "Assistant unavailable.", handoff: true },
      };
    }
  } catch {
    await handoffSupportTicketToHuman({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
      reason: "Assistant not configured",
    });
    return {
      ok: false,
      result: { ok: false, code: "AGENT_MISSING", message: "Assistant unavailable.", handoff: true },
    };
  }

  return { ok: true, ticket: row, agentId };
}

export function assistantTurnFailureResponse(result: Extract<RunAssistantTurnResult, { ok: false }>) {
  const status =
    result.code === "NOT_FOUND"
      ? 404
      : result.code === "NOT_ASSISTANT" || result.code === "TICKET_CLOSED" || result.code === "EMAIL_CHANNEL"
        ? 409
        : result.code === "IN_FLIGHT"
          ? 429
          : result.handoff
            ? 200
            : 400;
  return errorResponse(result.message, result.code, status);
}
