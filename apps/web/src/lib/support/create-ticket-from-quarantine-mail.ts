import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFirstResponseDueIso, computeSlaResolutionDueIso } from "@/lib/support/support-ticket-sla";
import { resolveEmailTicketCategory } from "@/lib/support/zoho-email-category";
import { htmlToPlainText } from "@/lib/integrations/zoho-mail";
import { startSupportTriageForTicket } from "@/workflows/start-support-triage";

/**
 * Promote a quarantined inbound mail row (skipped/failed, no ticket) into a support ticket.
 */
export async function createTicketFromQuarantineMail(
  supabase: SupabaseClient,
  mailMessageId: string,
): Promise<{ ticket_id: string }> {
  const { data: mail, error } = await supabase
    .from("support_mail_messages")
    .select("*, mailbox:support_mailboxes(id, tenant_id, address, default_category)")
    .eq("id", mailMessageId)
    .maybeSingle();
  if (error) throw error;
  if (!mail) throw new Error("mail_not_found");

  const m = mail as {
    ticket_id?: string | null;
    zoho_message_id?: string;
    zoho_thread_id?: string | null;
    from_address?: string | null;
    subject?: string | null;
    body_html?: string | null;
    mailbox?: { id: string; tenant_id: string; address: string; default_category?: string | null };
  };

  if (m.ticket_id) {
    return { ticket_id: m.ticket_id };
  }
  if (!m.mailbox?.tenant_id) {
    throw new Error("mailbox_missing");
  }

  const subject = String(m.subject ?? "(No subject)").slice(0, 255);
  const plain =
    (m.body_html ? htmlToPlainText(m.body_html) : "").slice(0, 10_000) ||
    `Email from ${m.from_address ?? "unknown"} (promoted from quarantine).`;

  const category = resolveEmailTicketCategory({
    defaultCategory: m.mailbox.default_category,
    subject,
    body: plain,
  });
  const priority = "medium";
  const nowIso = new Date().toISOString();

  const { data: ticket, error: tErr } = await supabase
    .from("support_tickets")
    .insert({
      subject,
      description: plain,
      status: "open",
      priority,
      category,
      channel: "email",
      tenant_id: m.mailbox.tenant_id,
      mailbox_id: m.mailbox.id,
      requester_email: m.from_address?.trim().toLowerCase() ?? null,
      zoho_thread_id: m.zoho_thread_id,
      sla_resolution_due_at: computeSlaResolutionDueIso(nowIso, priority),
      first_response_due_at: computeFirstResponseDueIso(nowIso, priority),
    })
    .select("id")
    .single();
  if (tErr) throw tErr;

  const ticketId = (ticket as { id: string }).id;

  const { data: msg } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      message: plain,
      is_internal: false,
    })
    .select("id")
    .single();

  await supabase
    .from("support_tickets")
    .update({
      last_message_at: nowIso,
      last_message_from: "customer",
      updated_at: nowIso,
    })
    .eq("id", ticketId);

  await supabase
    .from("support_mail_messages")
    .update({
      ticket_id: ticketId,
      support_ticket_message_id: (msg as { id?: string })?.id ?? null,
      delivery_status: "sent",
      skip_reason: null,
      updated_at: nowIso,
    })
    .eq("id", mailMessageId);

  try {
    await startSupportTriageForTicket(ticketId);
  } catch {
    /* best-effort */
  }

  return { ticket_id: ticketId };
}
