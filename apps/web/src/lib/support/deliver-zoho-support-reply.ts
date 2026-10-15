import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getZohoAccessTokenForConnection,
  parseAddressList,
  zohoReplyToMessage,
  zohoSendNewMessage,
  ZohoMailApiError,
} from "@/lib/integrations/zoho-mail";

const SENDING_STALE_MS = 2 * 60 * 1000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function subjectWithTicketNumber(subject: string, ticketNumber: string): string {
  if (/TKT-\d{8}-\d{6}/i.test(subject)) return subject;
  return `${subject} [${ticketNumber}]`.slice(0, 255);
}

export type DeliverZohoReplyResult =
  | { ok: true; status: "sent" | "skipped" }
  | { ok: false; status: "failed" | "blocked"; error?: string };

/**
 * Send a public staff reply for email-channel tickets via Zoho Mail.
 */
export async function deliverSupportReplyByZoho(
  supabase: SupabaseClient,
  params: {
    ticketId: string;
    messageId: string;
    plainText: string;
  },
): Promise<DeliverZohoReplyResult> {
  const { data: ticket, error: ticketErr } = await supabase
    .from("support_tickets")
    .select(
      "id, channel, subject, ticket_number, requester_email, user_id, mailbox_id, zoho_thread_id",
    )
    .eq("id", params.ticketId)
    .maybeSingle();
  if (ticketErr) throw ticketErr;
  if (!ticket) return { ok: false, status: "failed", error: "ticket_not_found" };

  if (String((ticket as { channel?: string }).channel ?? "app") !== "email") {
    return { ok: true, status: "skipped" };
  }

  const mailboxId = (ticket as { mailbox_id?: string | null }).mailbox_id;
  if (!mailboxId) {
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "skipped" })
      .eq("id", params.messageId);
    return { ok: true, status: "skipped" };
  }

  const { data: mailbox, error: mbErr } = await supabase
    .from("support_mailboxes")
    .select("*, connection:support_zoho_connections(*)")
    .eq("id", mailboxId)
    .maybeSingle();
  if (mbErr) throw mbErr;
  if (!mailbox) {
    return { ok: false, status: "failed", error: "mailbox_not_found" };
  }

  const mb = mailbox as {
    address: string;
    outbound_enabled: boolean;
    connection: {
      id: string;
      enabled: boolean;
      auth_status: string;
      data_center: string;
      zoho_account_id: string | null;
    };
  };

  if (!mb.outbound_enabled || !mb.connection?.enabled || mb.connection.auth_status !== "ok") {
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "skipped" })
      .eq("id", params.messageId);
    return { ok: true, status: "skipped" };
  }

  const { data: existingMsg } = await supabase
    .from("support_ticket_messages")
    .select("email_delivery_status, created_at")
    .eq("id", params.messageId)
    .maybeSingle();
  const deliveryStatus = (existingMsg as { email_delivery_status?: string | null })
    ?.email_delivery_status;
  const createdAt = (existingMsg as { created_at?: string })?.created_at;
  if (deliveryStatus === "sent") {
    return { ok: true, status: "sent" };
  }
  if (deliveryStatus === "sending") {
    const age = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
    if (age < SENDING_STALE_MS) {
      return { ok: false, status: "blocked" };
    }
  }

  await supabase
    .from("support_ticket_messages")
    .update({ email_delivery_status: "sending" })
    .eq("id", params.messageId);

  let toAddress = (ticket as { requester_email?: string | null }).requester_email?.trim() ?? "";
  if (!toAddress && (ticket as { user_id?: string | null }).user_id) {
    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("id", (ticket as { user_id: string }).user_id)
      .maybeSingle();
    toAddress = String((user as { email?: string } | null)?.email ?? "").trim();
  }
  if (!toAddress) {
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "failed" })
      .eq("id", params.messageId);
    return { ok: false, status: "failed", error: "no_recipient_email" };
  }

  const accountId = mb.connection.zoho_account_id;
  if (!accountId) {
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "failed" })
      .eq("id", params.messageId);
    return { ok: false, status: "failed", error: "missing_zoho_account" };
  }

  const html = `<div>${escapeHtml(params.plainText).replace(/\n/g, "<br/>")}</div>`;
  const ticketNumber = String((ticket as { ticket_number?: string }).ticket_number ?? params.ticketId);
  const subject = subjectWithTicketNumber(String((ticket as { subject?: string }).subject ?? "Support"), ticketNumber);

  try {
    const { token } = await getZohoAccessTokenForConnection(supabase, mb.connection.id);
    const mailBase = mb.connection.data_center;

    const { data: inboundRows } = await supabase
      .from("support_mail_messages")
      .select("zoho_message_id, zoho_folder_id, cc_address")
      .eq("ticket_id", params.ticketId)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(1);

    const latestInbound = (inboundRows ?? [])[0] as
      | { zoho_message_id?: string; zoho_folder_id?: string; cc_address?: string | null }
      | undefined;

    const mailboxLower = mb.address.trim().toLowerCase();
    const ccCandidates = parseAddressList(latestInbound?.cc_address ?? "").filter(
      (a) => a && a !== mailboxLower && a !== toAddress.toLowerCase(),
    );
    const ccAddress = ccCandidates.length > 0 ? ccCandidates.join(",") : undefined;

    let zohoResponse;
    if (latestInbound?.zoho_message_id) {
      const replyPayload = {
        fromAddress: mb.address,
        toAddress,
        content: html,
        mailFormat: "html" as const,
        ...(ccAddress ? { ccAddress } : {}),
      };
      try {
        zohoResponse = await zohoReplyToMessage(
          mailBase,
          token,
          accountId,
          latestInbound.zoho_message_id,
          replyPayload,
        );
      } catch (err) {
        if (!ccAddress) throw err;
        zohoResponse = await zohoReplyToMessage(mailBase, token, accountId, latestInbound.zoho_message_id, {
          fromAddress: mb.address,
          toAddress,
          content: html,
          mailFormat: "html",
        });
      }
    } else {
      zohoResponse = await zohoSendNewMessage(mailBase, token, accountId, {
        fromAddress: mb.address,
        toAddress,
        subject,
        content: html,
        mailFormat: "html",
      });
    }

    const outData = (zohoResponse.data ?? {}) as { messageId?: string; mailId?: string };
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "sent" })
      .eq("id", params.messageId);

    if (outData.messageId) {
      await supabase.from("support_mail_messages").insert({
        mailbox_id: mailboxId,
        zoho_message_id: outData.messageId,
        zoho_thread_id: (ticket as { zoho_thread_id?: string | null }).zoho_thread_id,
        ticket_id: params.ticketId,
        support_ticket_message_id: params.messageId,
        direction: "outbound",
        from_address: mb.address,
        to_address: toAddress,
        subject,
        delivery_status: "sent",
        rfc_message_id: outData.mailId ?? null,
      });
    }

    return { ok: true, status: "sent" };
  } catch (err) {
    const msg = err instanceof ZohoMailApiError ? err.message : "Zoho send failed";
    await supabase
      .from("support_ticket_messages")
      .update({ email_delivery_status: "failed" })
      .eq("id", params.messageId);
    return { ok: false, status: "failed", error: msg };
  }
}
