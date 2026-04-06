import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import {
  notifySupportStaffInboxActivity,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
});

/**
 * POST /api/me/support-tickets/[id]/messages
 *
 * Add a reply to the current user's support ticket (owner only).
 * Messages are always non-internal (visible to user).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
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

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, user_id, ticket_number, subject, assigned_to")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return notFoundResponse("Ticket not found");
    }

    if (ticket.user_id !== user.id) {
      return errorResponse("You can only reply to your own tickets", "FORBIDDEN", 403);
    }

    const bodyText = message.slice(0, 10000) || (attachments.length ? "(attachment)" : "");

    const { data: newMessage, error: insertError } = await supabase
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

    await supabase
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    try {
      const staffIds = await resolveSupportTicketStaffRecipients(ticket.assigned_to ?? null);
      const previewText =
        message.slice(0, 180) ||
        (attachments.length ? `Sent ${attachments.length} attachment(s)` : "New reply");
      const ellip = message.length > 180 ? "…" : "";
      await notifySupportStaffInboxActivity(
        staffIds,
        ticket.ticket_number || id,
        `Customer replied: ${previewText}${ellip}`,
        id,
        ["email", "push"]
      );
    } catch (notifyErr) {
      console.error("Support staff reply notification failed:", notifyErr);
    }

    return successResponse({ message: newMessage });
  } catch (error) {
    return handleApiError(error, "Failed to add message");
  }
}
