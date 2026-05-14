import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { notifySupportTicketUpdated } from "@/lib/notifications/notification-service";
import { slackNotifySupportTicketReply } from "@/lib/integrations/slack/triggers";
import { z } from "zod";

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = getSupabaseAdmin();
    const { id } = await params;

    const body = await request.json();
    const { message: rawMessage, is_internal } = body;
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    let attachments: z.infer<typeof attachmentSchema>[] = [];
    if (body?.attachments != null) {
      const parsed = z.array(attachmentSchema).safeParse(body.attachments);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
      }
      attachments = parsed.data.slice(0, 10);
    }

    if (!message && attachments.length === 0) {
      return NextResponse.json({ error: "Message or attachments are required" }, { status: 400 });
    }

    const isInternal = is_internal === true;

    // Verify ticket exists (RLS would hide rows for some roles if we used the anon/session client;
    // staff roles are enforced above via requireRoleInApi.)
    const { data: ticket, error: ticketErr } = await supabase
      .from("support_tickets")
      .select("id, user_id, provider_id, ticket_number, subject, priority, first_staff_reply_at, status, requester_type, support_context_type, support_context_label")
      .eq("id", id)
      .maybeSingle();

    if (ticketErr) throw ticketErr;
    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found" },
        { status: 404 }
      );
    }

    // Check access
    const isAdmin = (SUPPORT_TICKET_STAFF_ROLES as readonly string[]).includes(user.role);
    const isOwner = ticket.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const messageBody = message.slice(0, 10000) || (attachments.length ? "(attachment)" : "");

    const { data, error } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: id,
        user_id: user.id,
        message: messageBody,
        is_internal: isInternal,
        attachments,
      })
      .select()
      .single();

    if (error) throw error;

    const ticketUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (!isInternal && isAdmin) {
      ticketUpdate.last_message_at = data.created_at ?? new Date().toISOString();
      ticketUpdate.last_message_from = "staff";
      if (!(ticket as { first_staff_reply_at?: string | null }).first_staff_reply_at) {
        ticketUpdate.first_staff_reply_at = new Date().toISOString();
      }
      const st = String((ticket as { status?: string }).status ?? "");
      if (st === "open" || st === "waiting_customer") {
        ticketUpdate.status = "in_progress";
      }
    }
    await supabase.from("support_tickets").update(ticketUpdate).eq("id", id);

    // When admin/support_agent replies with a public message, notify the ticket owner (email + in-app for swift communication)
    if (!isInternal && isAdmin && ticket.user_id) {
      try {
        const previewText =
          message.slice(0, 200) ||
          (attachments.length ? `Sent ${attachments.length} attachment(s)` : "");
        const ellip = message.length > 200 ? "…" : "";
        await notifySupportTicketUpdated(
          ticket.user_id,
          ticket.ticket_number || id,
          `Support replied: ${previewText}${ellip}`,
          id,
          ["email", "push"],
          String((ticket as { requester_type?: string | null }).requester_type ?? "") === "provider"
            ? "provider"
            : "customer"
        );
      } catch (notifyErr) {
        console.error("Support ticket reply notification failed:", notifyErr);
      }
    }

    if (!isInternal && isAdmin) {
      try {
        const previewText =
          message.slice(0, 180) ||
          (attachments.length ? `Sent ${attachments.length} attachment(s)` : "New reply");
        await slackNotifySupportTicketReply(
          request,
          ticket as {
            id: string;
            ticket_number?: string | null;
            subject?: string | null;
            priority?: string | null;
            requester_type?: string | null;
            support_context_type?: string | null;
            support_context_label?: string | null;
          },
          previewText,
          { authorType: "staff", messageId: data.id as string | undefined }
        );
      } catch (slackErr) {
        console.error("Slack staff reply notification failed:", slackErr);
      }
    }

    return NextResponse.json({ message: data });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to create message");
  }
}
