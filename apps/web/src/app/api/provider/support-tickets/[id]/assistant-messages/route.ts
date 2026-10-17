import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { runSupportAssistantTurn } from "@/lib/support/support-assistant/run-turn";
import {
  assistantTurnFailureResponse,
  precheckSupportAssistantTurn,
} from "@/lib/support/support-assistant/turn-precheck";
import { handoffSupportTicketToHuman } from "@/lib/support/support-assistant/handoff";
import { isSupportAssistantEnabledForUser } from "@/lib/support/support-assistant/availability";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

const bodySchema = z.object({
  message: z.string().min(1).max(5000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    const access = await requireProviderSupportTicketAccess<{
      id: string;
      handling_mode?: string | null;
      status?: string | null;
      channel?: string | null;
    }>(admin, user.id, id, "id, handling_mode, status, channel");
    if (access.response) return access.response;

    const handlingMode = String(access.ticket.handling_mode ?? "human");
    const currentStatus = String(access.ticket.status ?? "");
    if (currentStatus === "resolved" || currentStatus === "closed") {
      return errorResponse("This ticket is closed to new replies", "TICKET_CLOSED", 409);
    }

    if (handlingMode === "assistant") {
      const pre = await precheckSupportAssistantTurn({ admin, ticketId: id, request });
      if (pre.ok === false) {
        return assistantTurnFailureResponse(pre.result);
      }
      const now = new Date().toISOString();
      const { data: customerMsg, error: insertErr } = await admin
        .from("support_ticket_messages")
        .insert({
          ticket_id: id,
          user_id: user.id,
          message: body.message.slice(0, 10000),
          is_internal: false,
          author_kind: "customer",
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      await admin
        .from("support_tickets")
        .update({
          last_message_at: customerMsg.created_at ?? now,
          last_message_from: "customer",
          last_customer_view_at: customerMsg.created_at ?? now,
          updated_at: now,
        })
        .eq("id", id);

      const turn = await runSupportAssistantTurn({
        admin,
        ticketId: id,
        userText: body.message,
        request,
      });

      if (turn.ok === false) {
        return assistantTurnFailureResponse(turn);
      }

      return successResponse({
        customerMessage: customerMsg,
        assistantMessage: turn.assistantMessage,
        handoff: turn.handoff,
      });
    }

    const assistantOn = await isSupportAssistantEnabledForUser({
      role: user.role,
      userId: user.id,
      platform: "provider",
    });
    if (assistantOn && handlingMode === "human") {
      await handoffSupportTicketToHuman({
        admin,
        ticketId: id,
        request,
        reason: "Assistant disabled mid-thread fallback",
      });
    }

    return errorResponse("Use the standard messages endpoint", "NOT_ASSISTANT", 400);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues.map((e) => e.message).join(", "), "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to send assistant message");
  }
}
