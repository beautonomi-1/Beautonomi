import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createSupportAssistantTextStream } from "@/lib/support/support-assistant/stream-turn";
import {
  assistantTurnFailureResponse,
  precheckSupportAssistantTurn,
} from "@/lib/support/support-assistant/turn-precheck";

const bodySchema = z.object({
  message: z.string().min(1).max(5000),
});

export async function postSupportAssistantMessageStream(params: {
  request: NextRequest;
  ticketId: string;
  userId: string;
  admin: SupabaseClient;
  loadTicket: () => Promise<{
    id: string;
    handling_mode?: string | null;
  } | null>;
}) {
  try {
    const body = bodySchema.parse(await params.request.json());
    const ticket = await params.loadTicket();
    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }
    const pre = await precheckSupportAssistantTurn({
      admin: params.admin,
      ticketId: params.ticketId,
      request: params.request,
    });
    if (pre.ok === false) {
      return assistantTurnFailureResponse(pre.result);
    }

    const now = new Date().toISOString();
    const { data: customerMsg, error: insertErr } = await params.admin
      .from("support_ticket_messages")
      .insert({
        ticket_id: params.ticketId,
        user_id: params.userId,
        message: body.message.slice(0, 10000),
        is_internal: false,
        author_kind: "customer",
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    await params.admin
      .from("support_tickets")
      .update({
        last_message_at: customerMsg.created_at ?? now,
        last_message_from: "customer",
        last_customer_view_at: customerMsg.created_at ?? now,
        updated_at: now,
      })
      .eq("id", params.ticketId);

    try {
      const streamResult = await createSupportAssistantTextStream({
        admin: params.admin,
        ticketId: params.ticketId,
        userText: body.message,
        request: params.request,
      });
      return streamResult.toTextStreamResponse();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "LLM_STREAMING_DISABLED" || msg === "LLM_NOT_CONFIGURED") {
        await params.admin
          .from("agent_runs")
          .update({ status: "retryable_failure" })
          .eq("workflow_type", "support-assistant")
          .eq("correlation_id", params.ticketId)
          .eq("status", "running");
        const { runSupportAssistantTurn } = await import("@/lib/support/support-assistant/run-turn");
        const turn = await runSupportAssistantTurn({
          admin: params.admin,
          ticketId: params.ticketId,
          userText: body.message,
          request: params.request,
        });
        if (turn.ok === false) {
          return assistantTurnFailureResponse(turn);
        }
        return new Response(JSON.stringify({ data: { assistantMessage: turn.assistantMessage, handoff: turn.handoff } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (msg === "LOCALE_ESCALATION") {
        return errorResponse(
          "Connecting you to a specialist who can help in your language.",
          "LOCALE_ESCALATION",
          200,
        );
      }
      throw e;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((e) => e.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to stream assistant reply");
  }
}
