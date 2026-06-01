import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeSlaResolutionDueIso } from "@/lib/support/support-ticket-sla";
import {
  notifySupportStaffInboxActivity,
  notifySupportTicketCreated,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";

export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";

export type CreateProviderSupportTicketParams = {
  /** Provider the ticket belongs to. */
  providerId: string;
  /** Ticket owner (the provider's user) so they can see/reply to it. */
  ownerUserId: string | null;
  /** Who authored the opening message (admin actor when opened by Ops). */
  actorUserId: string | null;
  subject: string;
  message: string;
  priority?: SupportTicketPriority;
  category?: string | null;
  supportContextType?: string | null;
  supportContextId?: string | null;
  supportContextLabel?: string | null;
  /**
   * Whether the opening message is from staff (Ops opening on behalf of a
   * provider) or the customer/provider themselves. Controls unread state.
   */
  messageFrom?: "staff" | "customer";
  /** Used for Slack new-ticket notifications. */
  request?: NextRequest;
};

export type CreatedSupportTicket = {
  id: string;
  ticket_number?: string | null;
};

/**
 * Shared helper to create a provider support ticket (with its opening message)
 * from server code, mirroring the inline logic in the provider/admin support
 * ticket routes. Best-effort notifications never block ticket creation.
 */
export async function createProviderSupportTicket(
  params: CreateProviderSupportTicketParams,
): Promise<CreatedSupportTicket> {
  const admin = getSupabaseAdmin();
  const priority: SupportTicketPriority = params.priority ?? "medium";
  const messageFrom = params.messageFrom ?? "staff";

  const { data: ticket, error: ticketError } = await admin
    .from("support_tickets")
    .insert({
      user_id: params.ownerUserId,
      provider_id: params.providerId,
      subject: params.subject,
      description: params.message.slice(0, 10000) || "(No description)",
      priority,
      status: "open",
      category: params.category ?? null,
      requester_type: "provider",
      support_context_type: params.supportContextType ?? null,
      support_context_id: params.supportContextId ?? null,
      support_context_label: params.supportContextLabel?.trim() || null,
    })
    .select()
    .single();
  if (ticketError) throw ticketError;

  const ticketRow = ticket as { id: string; ticket_number?: string | null; created_at?: string };

  const createdAt = ticketRow.created_at;
  if (createdAt) {
    await admin
      .from("support_tickets")
      .update({ sla_resolution_due_at: computeSlaResolutionDueIso(createdAt, priority) })
      .eq("id", ticketRow.id);
  }

  const { data: message, error: messageError } = await admin
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketRow.id,
      user_id: params.actorUserId,
      message: params.message,
      is_internal: false,
    })
    .select()
    .single();
  if (messageError) {
    await admin.from("support_tickets").delete().eq("id", ticketRow.id);
    throw messageError;
  }

  const messageCreatedAt = (message as { created_at?: string }).created_at;
  await admin
    .from("support_tickets")
    .update({
      last_message_at: messageCreatedAt,
      last_message_from: messageFrom,
    })
    .eq("id", ticketRow.id);

  // Notify the provider that a ticket was opened (staff-initiated needs their attention).
  if (params.ownerUserId) {
    try {
      await notifySupportTicketCreated(
        params.ownerUserId,
        ticketRow.ticket_number || ticketRow.id,
        params.subject,
        ticketRow.id,
        ["email", "push"],
        "provider",
      );
    } catch (notifyErr) {
      console.error("createProviderSupportTicket: owner notification failed", notifyErr);
    }
  }

  try {
    const staffIds = await resolveSupportTicketStaffRecipients(null);
    await notifySupportStaffInboxActivity(
      staffIds,
      ticketRow.ticket_number || ticketRow.id,
      `New provider ticket: ${params.subject.slice(0, 200)}`,
      ticketRow.id,
      ["email", "push"],
    );
  } catch (staffNotifyErr) {
    console.error("createProviderSupportTicket: staff notification failed", staffNotifyErr);
  }

  if (params.request) {
    try {
      const { slackNotifyNewSupportTicket } = await import("@/lib/integrations/slack/triggers");
      await slackNotifyNewSupportTicket(params.request, {
        id: ticketRow.id,
        ticket_number: ticketRow.ticket_number ?? undefined,
        subject: params.subject,
        priority,
        requester_type: "provider",
        support_context_type: params.supportContextType ?? undefined,
        support_context_label: params.supportContextLabel ?? undefined,
      });
    } catch (slackErr) {
      console.error("createProviderSupportTicket: slack notification failed", slackErr);
    }
  }

  return { id: ticketRow.id, ticket_number: ticketRow.ticket_number };
}
