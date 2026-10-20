import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, handleApiError, successResponse } from "@/lib/supabase/api-helpers";
import { createSupportAssistantTextStream } from "@/lib/support/support-assistant/stream-turn";
import {
  assistantTurnFailureResponse,
  precheckSupportAssistantTurn,
} from "@/lib/support/support-assistant/turn-precheck";

const bodySchema = z.object({
  mode: z.enum(["initial", "follow_up"]).optional().default("follow_up"),
  message: z.string().max(5000).optional(),
});

async function streamAssistantReplyForText(params: {
  admin: SupabaseClient;
  ticketId: string;
  userText: string;
  request: NextRequest;
}) {
  try {
    const streamResult = await createSupportAssistantTextStream({
      admin: params.admin,
      ticketId: params.ticketId,
      userText: params.userText,
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
        userText: params.userText,
        request: params.request,
      });
      if (turn.ok === false) {
        return assistantTurnFailureResponse(turn);
      }
      return new Response(
        JSON.stringify({ data: { assistantMessage: turn.assistantMessage, handoff: turn.handoff } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
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
}

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
    const mode = body.mode ?? "follow_up";
    const message = (body.message ?? "").trim();
    if (mode === "follow_up" && !message) {
      return errorResponse("Message is required", "VALIDATION_ERROR", 400);
    }

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
      if (pre.result.handoff && mode === "follow_up" && message) {
        const now = new Date().toISOString();
        const { data: customerMsg, error: insertErr } = await params.admin
          .from("support_ticket_messages")
          .insert({
            ticket_id: params.ticketId,
            user_id: params.userId,
            message: message.slice(0, 10000),
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
            last_customer_reply_at: now,
            updated_at: now,
          })
          .eq("id", params.ticketId);
        try {
          const { notifySupportStaffInboxActivity, resolveSupportTicketStaffRecipients } = await import(
            "@/lib/notifications/notification-service"
          );
          const { data: ticketRow } = await params.admin
            .from("support_tickets")
            .select("ticket_number, assigned_to")
            .eq("id", params.ticketId)
            .maybeSingle();
          const staffIds = await resolveSupportTicketStaffRecipients(
            (ticketRow as { assigned_to?: string | null } | null)?.assigned_to ?? null,
          );
          const preview = message.slice(0, 180);
          await notifySupportStaffInboxActivity(
            staffIds,
            String((ticketRow as { ticket_number?: string } | null)?.ticket_number ?? params.ticketId),
            `Customer replied: ${preview}${message.length > 180 ? "…" : ""}`,
            params.ticketId,
            ["email", "push"],
          );
        } catch (notifyErr) {
          console.error("Support staff reply notification failed:", notifyErr);
        }
        return successResponse({ message: customerMsg, handoff: true });
      }
      return assistantTurnFailureResponse(pre.result);
    }

    if (mode === "initial") {
      const { data: recent } = await params.admin
        .from("support_ticket_messages")
        .select("id, message, author_kind, created_at")
        .eq("ticket_id", params.ticketId)
        .eq("is_internal", false)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = (recent ?? [])[0] as { author_kind?: string; message?: string } | undefined;
      if (!latest || String(latest.author_kind ?? "") !== "customer") {
        return successResponse({ alreadyAnswered: true });
      }
      const userText = String(latest.message ?? "").trim();
      if (!userText) {
        return errorResponse("No customer message to answer", "VALIDATION_ERROR", 400);
      }
      return streamAssistantReplyForText({
        admin: params.admin,
        ticketId: params.ticketId,
        userText,
        request: params.request,
      });
    }

    const now = new Date().toISOString();
    const { data: customerMsg, error: insertErr } = await params.admin
      .from("support_ticket_messages")
      .insert({
        ticket_id: params.ticketId,
        user_id: params.userId,
        message: message.slice(0, 10000),
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

    return streamAssistantReplyForText({
      admin: params.admin,
      ticketId: params.ticketId,
      userText: message,
      request: params.request,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((e) => e.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to stream assistant reply");
  }
}
