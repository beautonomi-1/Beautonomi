import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  notifySupportStaffInboxActivity,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";
import { computeFirstResponseDueIso } from "@/lib/support/support-ticket-sla";
import { startSupportTriageForTicket } from "@/workflows/start-support-triage";

export async function handoffSupportTicketToHuman(params: {
  admin: SupabaseClient;
  ticketId: string;
  request?: NextRequest;
  reason?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: ticket } = await params.admin
    .from("support_tickets")
    .select("id, ticket_number, subject, priority, assigned_to, handling_mode, assistant_handoff_at")
    .eq("id", params.ticketId)
    .maybeSingle();

  if (!ticket) return;
  const handlingMode = String((ticket as { handling_mode?: string }).handling_mode ?? "human");
  if (handlingMode !== "assistant") {
    return;
  }
  if ((ticket as { assistant_handoff_at?: string | null }).assistant_handoff_at) {
    return;
  }

  const priority = String((ticket as { priority?: string }).priority ?? "medium");
  await params.admin
    .from("support_tickets")
    .update({
      handling_mode: "human",
      assistant_handoff_at: now,
      first_response_due_at: computeFirstResponseDueIso(now, priority),
      updated_at: now,
    })
    .eq("id", params.ticketId);

  if (params.reason?.trim()) {
    await params.admin.from("support_ticket_notes").insert({
      ticket_id: params.ticketId,
      user_id: null,
      note: `[Assistant handoff] ${params.reason.trim().slice(0, 2000)}`,
      is_private: true,
    });
  }

  try {
    const staffIds = await resolveSupportTicketStaffRecipients(
      (ticket as { assigned_to?: string | null }).assigned_to ?? null,
    );
    await notifySupportStaffInboxActivity(
      staffIds,
      String((ticket as { ticket_number?: string }).ticket_number ?? params.ticketId),
      `Handoff from AI assistant: ${String((ticket as { subject?: string }).subject ?? "").slice(0, 180)}`,
      params.ticketId,
      ["email", "push"],
    );
  } catch (err) {
    console.error("Support staff handoff notification failed:", err);
  }

  if (params.request) {
    try {
      const { slackNotifyNewSupportTicket } = await import("@/lib/integrations/slack/triggers");
      await slackNotifyNewSupportTicket(params.request, ticket as {
        id: string;
        ticket_number?: string;
        subject?: string;
        priority?: string;
      });
    } catch (err) {
      console.error("Slack handoff notification failed:", err);
    }
  }

  try {
    await startSupportTriageForTicket(params.ticketId);
  } catch (err) {
    console.error("Support triage after handoff failed:", err);
  }
}
