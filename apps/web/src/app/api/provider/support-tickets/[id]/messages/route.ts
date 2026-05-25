import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import {
  notifySupportStaffInboxActivity,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    let attachments: z.infer<typeof attachmentSchema>[] = [];
    if (body?.attachments != null) {
      const parsed = z.array(attachmentSchema).safeParse(body.attachments);
      if (!parsed.success) {
        return errorResponse("Invalid attachments payload", "VALIDATION_ERROR", 400);
      }
      attachments = parsed.data.slice(0, 10);
    }

    if (!message && attachments.length === 0) {
      return errorResponse("Message or attachments are required", "VALIDATION_ERROR", 400);
    }

    const access = await requireProviderSupportTicketAccess<{
      id: string;
      provider_id: string | null;
      requester_type: string | null;
      ticket_number?: string | null;
      subject?: string | null;
      priority?: string | null;
      assigned_to?: string | null;
      status?: string | null;
      support_context_type?: string | null;
      support_context_label?: string | null;
    }>(
      admin,
      user.id,
      id,
      "id, provider_id, requester_type, ticket_number, subject, priority, assigned_to, status, support_context_type, support_context_label",
    );
    if (access.response) return access.response;

    const currentStatus = String(access.ticket.status ?? "");
    if (currentStatus === "resolved" || currentStatus === "closed") {
      return errorResponse("This ticket is closed to new replies", "TICKET_CLOSED", 409);
    }

    const bodyText = message.slice(0, 10000) || (attachments.length ? "(attachment)" : "");
    const { data: newMessage, error: insertError } = await admin
      .from("support_ticket_messages")
      .insert({
        ticket_id: id,
        user_id: user.id,
        message: bodyText,
        is_internal: false,
        attachments,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const ticketUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      last_customer_reply_at: new Date().toISOString(),
      last_message_at: newMessage.created_at ?? new Date().toISOString(),
      last_message_from: "customer",
      last_customer_view_at: newMessage.created_at ?? new Date().toISOString(),
    };
    if (currentStatus === "waiting_customer") {
      ticketUpdate.status = "in_progress";
    }
    await admin.from("support_tickets").update(ticketUpdate).eq("id", id);

    try {
      const staffIds = await resolveSupportTicketStaffRecipients(access.ticket.assigned_to ?? null);
      const previewText =
        message.slice(0, 180) ||
        (attachments.length ? `Sent ${attachments.length} attachment(s)` : "New reply");
      const ellip = message.length > 180 ? "..." : "";
      await notifySupportStaffInboxActivity(
        staffIds,
        access.ticket.ticket_number || id,
        `Provider replied: ${previewText}${ellip}`,
        id,
        ["email", "push"],
      );
    } catch (notifyErr) {
      console.error("Support staff provider reply notification failed:", notifyErr);
    }

    try {
      const { slackNotifySupportTicketReply } = await import("@/lib/integrations/slack/triggers");
      const previewText =
        message.slice(0, 180) ||
        (attachments.length ? `Sent ${attachments.length} attachment(s)` : "New reply");
      await slackNotifySupportTicketReply(
        request,
        access.ticket,
        previewText,
        { authorType: "provider", messageId: newMessage.id as string | undefined },
      );
    } catch (slackErr) {
      console.error("Slack provider reply notification failed:", slackErr);
    }

    return successResponse({
      message: {
        ...newMessage,
        author_name: "You",
        is_mine: true,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to add provider support message");
  }
}
