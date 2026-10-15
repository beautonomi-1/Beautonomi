import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractNewReplyPlainText,
  extractTicketNumberFromSubject,
  getZohoAccessTokenForConnection,
  getZohoMessageContent,
  getZohoMessageHeaders,
  htmlToPlainText,
  isAutoReplyFallback,
  isAutoReplyHeaders,
  listZohoFolders,
  listZohoMessages,
  parseAddressList,
  parseEmailAddress,
  resolveInboxFolderId,
  rfcIdsFromHeaders,
  zohoReplyToMessage,
  ZohoMailApiError,
  type ZohoMessageListRow,
} from "@/lib/integrations/zoho-mail";
import { computeFirstResponseDueIso, computeSlaResolutionDueIso } from "@/lib/support/support-ticket-sla";
import { resolveEmailTicketCategory } from "@/lib/support/zoho-email-category";
import { startSupportTriageForTicket } from "@/workflows/start-support-triage";
import {
  notifySupportStaffInboxActivity,
  resolveSupportTicketStaffRecipients,
} from "@/lib/notifications/notification-service";
import { ingestZohoInboundAttachments } from "@/lib/support/zoho-mail-ingest-attachments";

const OVERLAP_MS = 2 * 60 * 1000;
const PLAIN_CAP = 10_000;
const HTML_CAP = 200_000;
const MAX_ATTEMPTS = 3;

export type SyncZohoInboxResult = {
  connections: number;
  imported: number;
  appended: number;
  skipped: number;
  failed: number;
};

type MailboxRow = {
  id: string;
  address: string;
  tenant_id: string;
  connection_id: string;
  inbound_enabled: boolean;
  ack_enabled: boolean;
  ack_subject: string | null;
  ack_body: string | null;
  lookback_hours: number;
  inbox_folder_id: string | null;
  blocked_senders: string[];
  default_category: string | null;
};

type ConnectionRow = {
  id: string;
  data_center: string;
  enabled: boolean;
  auth_status: string;
  poll_page_cap: number;
  max_messages_per_run: number;
  html_retention_days: number;
  zoho_account_id: string | null;
};

function parseReceivedMs(row: ZohoMessageListRow): number {
  const n = Number(row.receivedTime ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function routeRowToMailbox(
  row: ZohoMessageListRow,
  mailboxes: MailboxRow[],
  folderId: string,
): { mailbox: MailboxRow | null; reason?: string } {
  const toList = parseAddressList(row.toAddress);
  const ccList = parseAddressList(row.ccAddress);
  const candidates = mailboxes.filter((m) => {
    const addr = m.address.trim().toLowerCase();
    return toList.includes(addr) || ccList.includes(addr);
  });
  if (candidates.length === 1) return { mailbox: candidates[0]! };
  const toMatch = candidates.filter((m) => toList.includes(m.address.trim().toLowerCase()));
  if (toMatch.length === 1) return { mailbox: toMatch[0]! };
  const folderMailboxes = mailboxes.filter((m) => {
    const fid = m.inbox_folder_id?.trim();
    return !fid || fid === folderId;
  });
  if (candidates.length === 0 && folderMailboxes.length === 1) {
    return { mailbox: folderMailboxes[0]! };
  }
  if (candidates.length === 0) return { mailbox: null, reason: "unrouted" };
  return { mailbox: null, reason: "ambiguous_recipients" };
}

async function resolveRequester(
  supabase: SupabaseClient,
  email: string,
): Promise<{ user_id: string | null; provider_id: string | null; requester_type: string | null }> {
  const normalized = email.trim().toLowerCase();
  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .ilike("email", normalized)
    .maybeSingle();
  if (user?.id) {
    const role = String((user as { role?: string }).role ?? "");
    const { data: provider } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (provider?.id) {
      return { user_id: user.id, provider_id: provider.id, requester_type: "provider" };
    }
    const requester_type = role.includes("provider") ? "provider" : "customer";
    return { user_id: user.id, provider_id: null, requester_type };
  }
  return { user_id: null, provider_id: null, requester_type: null };
}

async function sendAcknowledgement(
  supabase: SupabaseClient,
  params: {
    mailbox: MailboxRow;
    connection: ConnectionRow;
    token: string;
    inboundMessageId: string;
    toAddress: string;
    ticketNumber: string;
  },
): Promise<void> {
  const subjectTemplate = params.mailbox.ack_subject?.trim() || "We received your request [{ticket_number}]";
  const bodyTemplate =
    params.mailbox.ack_body?.trim() ||
    "Thank you for contacting support. Your reference is {ticket_number}. We will reply soon.";
  const subject = subjectTemplate
    .replace(/\{ticket_number\}/g, params.ticketNumber)
    .replace(/\{mailbox\}/g, params.mailbox.address);
  const body = bodyTemplate
    .replace(/\{ticket_number\}/g, params.ticketNumber)
    .replace(/\{mailbox\}/g, params.mailbox.address);
  const html = `<div>${body.replace(/\n/g, "<br/>")}</div>`;
  await zohoReplyToMessage(
    params.connection.data_center,
    params.token,
    params.connection.zoho_account_id!,
    params.inboundMessageId,
    {
      fromAddress: params.mailbox.address,
      toAddress: params.toAddress,
      content: html,
      mailFormat: "html",
    },
  );
  await supabase.from("support_mail_ack_log").insert({
    mailbox_id: params.mailbox.id,
    sender_address: params.toAddress,
  });
  // Ack is not stored as staff reply; optional mail row could be added later.
  void subject;
}

async function attachZohoFilesToSupportMessage(
  supabase: SupabaseClient,
  params: {
    connection: ConnectionRow;
    token: string;
    folderId: string;
    row: ZohoMessageListRow;
    zohoMessageId: string;
    ticketId: string;
    supportTicketMessageId: string | undefined;
    requesterUserId: string | null;
  },
): Promise<void> {
  if (!params.supportTicketMessageId || !params.connection.zoho_account_id) return;
  try {
    await ingestZohoInboundAttachments(supabase, {
      mailBase: params.connection.data_center,
      token: params.token,
      accountId: params.connection.zoho_account_id,
      folderId: params.folderId,
      zohoMessageId: params.zohoMessageId,
      listRow: params.row,
      ticketId: params.ticketId,
      supportTicketMessageId: params.supportTicketMessageId,
      requesterUserId: params.requesterUserId,
    });
  } catch (err) {
    console.warn("[zoho-ingest] inbound attachments:", err instanceof Error ? err.message : err);
  }
}

async function processOneMessage(
  supabase: SupabaseClient,
  params: {
    connection: ConnectionRow;
    token: string;
    folderId: string;
    row: ZohoMessageListRow;
    mailboxes: MailboxRow[];
    counts: { imported: number; appended: number; skipped: number; failed: number };
  },
): Promise<void> {
  const zohoMessageId = String(params.row.messageId ?? "").trim();
  if (!zohoMessageId) {
    params.counts.skipped += 1;
    return;
  }

  const { data: existing } = await supabase
    .from("support_mail_messages")
    .select("id, delivery_status, attempt_count")
    .eq("zoho_message_id", zohoMessageId)
    .maybeSingle();
  if (existing?.id) {
    const status = String((existing as { delivery_status?: string }).delivery_status ?? "");
    const attempts = (existing as { attempt_count?: number }).attempt_count ?? 0;
    if (status === "sent" || status === "skipped") {
      params.counts.skipped += 1;
      return;
    }
    if (status === "failed" && attempts >= MAX_ATTEMPTS) {
      params.counts.skipped += 1;
      return;
    }
    if (status === "pending" && attempts > 0 && attempts < MAX_ATTEMPTS) {
      // Retry content/header processing below (do not treat as duplicate).
    } else if (status !== "pending") {
      params.counts.skipped += 1;
      return;
    }
  }

  const route = routeRowToMailbox(params.row, params.mailboxes, params.folderId);
  const fromAddress = parseEmailAddress(params.row.fromAddress);

  if (route.mailbox && fromAddress === route.mailbox.address.trim().toLowerCase()) {
    await supabase.from("support_mail_messages").insert({
      mailbox_id: route.mailbox.id,
      zoho_message_id: zohoMessageId,
      zoho_thread_id: params.row.threadId ?? null,
      zoho_folder_id: params.folderId,
      direction: "inbound",
      from_address: fromAddress,
      to_address: params.row.toAddress ?? null,
      cc_address: params.row.ccAddress ?? null,
      subject: params.row.subject ?? null,
      delivery_status: "skipped",
      skip_reason: "from_mailbox",
      received_at: new Date(parseReceivedMs(params.row)).toISOString(),
    });
    params.counts.skipped += 1;
    return;
  }

  if (!route.mailbox) {
    const mbForQuarantine = params.mailboxes[0];
    if (mbForQuarantine) {
      await supabase.from("support_mail_messages").insert({
        mailbox_id: mbForQuarantine.id,
        zoho_message_id: zohoMessageId,
        zoho_thread_id: params.row.threadId ?? null,
        zoho_folder_id: params.folderId,
        direction: "inbound",
        from_address: fromAddress,
        subject: params.row.subject ?? null,
        delivery_status: "skipped",
        skip_reason: route.reason ?? "unrouted",
        received_at: new Date(parseReceivedMs(params.row)).toISOString(),
      });
    }
    params.counts.skipped += 1;
    return;
  }

  const mailbox = route.mailbox;
  if (mailbox.blocked_senders?.some((b) => b.trim().toLowerCase() === fromAddress)) {
    await supabase.from("support_mail_messages").insert({
      mailbox_id: mailbox.id,
      zoho_message_id: zohoMessageId,
      direction: "inbound",
      from_address: fromAddress,
      delivery_status: "skipped",
      skip_reason: "blocked_sender",
      received_at: new Date(parseReceivedMs(params.row)).toISOString(),
    });
    params.counts.skipped += 1;
    return;
  }

  let headers: Record<string, string[]> = {};
  let headerFailed = false;
  try {
    headers = await getZohoMessageHeaders(
      params.connection.data_center,
      params.token,
      params.connection.zoho_account_id!,
      params.folderId,
      zohoMessageId,
    );
  } catch {
    headerFailed = true;
  }

  const subject = String(params.row.subject ?? "");
  if (isAutoReplyHeaders(headers) || isAutoReplyFallback(fromAddress, subject)) {
    await supabase.from("support_mail_messages").insert({
      mailbox_id: mailbox.id,
      zoho_message_id: zohoMessageId,
      direction: "inbound",
      from_address: fromAddress,
      subject,
      delivery_status: "skipped",
      skip_reason: headerFailed ? "auto_reply_fallback" : "auto_reply",
      received_at: new Date(parseReceivedMs(params.row)).toISOString(),
    });
    params.counts.skipped += 1;
    return;
  }

  let contentRaw = "";
  let htmlRaw = "";
  try {
    const content = await getZohoMessageContent(
      params.connection.data_center,
      params.token,
      params.connection.zoho_account_id!,
      params.folderId,
      zohoMessageId,
    );
    htmlRaw = (content.content ?? "").slice(0, HTML_CAP);
    contentRaw = (content.textContent ?? htmlToPlainText(htmlRaw)).trim();
  } catch (err) {
    const { data: failRow } = await supabase
      .from("support_mail_messages")
      .select("id, attempt_count")
      .eq("zoho_message_id", zohoMessageId)
      .maybeSingle();
    const attempt = ((failRow as { attempt_count?: number } | null)?.attempt_count ?? 0) + 1;
    if (failRow?.id) {
      await supabase
        .from("support_mail_messages")
        .update({
          attempt_count: attempt,
          delivery_status: attempt >= MAX_ATTEMPTS ? "failed" : "pending",
          delivery_error: err instanceof Error ? err.message : "content_fetch_failed",
        })
        .eq("id", failRow.id);
    } else {
      await supabase.from("support_mail_messages").insert({
        mailbox_id: mailbox.id,
        zoho_message_id: zohoMessageId,
        direction: "inbound",
        from_address: fromAddress,
        subject,
        attempt_count: attempt,
        delivery_status: attempt >= MAX_ATTEMPTS ? "failed" : "pending",
        delivery_error: err instanceof Error ? err.message : "content_fetch_failed",
        received_at: new Date(parseReceivedMs(params.row)).toISOString(),
      });
    }
    if (attempt >= MAX_ATTEMPTS) params.counts.failed += 1;
    return;
  }

  const plain = extractNewReplyPlainText(contentRaw).slice(0, PLAIN_CAP) || subject.slice(0, PLAIN_CAP);
  const rfcIds = rfcIdsFromHeaders(headers);
  const rfcMessageId = rfcIds[rfcIds.length - 1] ?? null;
  const threadId = params.row.threadId ?? null;
  const ticketNumberToken = extractTicketNumberFromSubject(subject);

  let ticketId: string | null = null;
  let created = false;

  if (threadId) {
    const { data: byThread } = await supabase
      .from("support_tickets")
      .select("id, status")
      .eq("mailbox_id", mailbox.id)
      .eq("zoho_thread_id", threadId)
      .maybeSingle();
    ticketId = (byThread as { id?: string } | null)?.id ?? null;
  }

  if (!ticketId && rfcIds.length > 0) {
    const { data: byRfc } = await supabase
      .from("support_mail_messages")
      .select("ticket_id")
      .in("rfc_message_id", rfcIds)
      .not("ticket_id", "is", null)
      .limit(1)
      .maybeSingle();
    ticketId = (byRfc as { ticket_id?: string } | null)?.ticket_id ?? null;
  }

  if (!ticketId && ticketNumberToken) {
    const { data: byNum } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("ticket_number", ticketNumberToken)
      .maybeSingle();
    ticketId = (byNum as { id?: string } | null)?.id ?? null;
  }

  const requester = await resolveRequester(supabase, fromAddress);

  if (!ticketId) {
    const category = resolveEmailTicketCategory({
      defaultCategory: mailbox.default_category,
      subject,
      body: plain,
    });
    const priority = "medium";
    const nowIso = new Date().toISOString();
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .insert({
        subject: subject.slice(0, 255) || "(No subject)",
        description: plain || "(No content)",
        status: "open",
        priority,
        category,
        channel: "email",
        tenant_id: mailbox.tenant_id,
        mailbox_id: mailbox.id,
        requester_email: fromAddress,
        zoho_thread_id: threadId,
        user_id: requester.user_id,
        provider_id: requester.provider_id,
        requester_type: requester.requester_type,
        sla_resolution_due_at: computeSlaResolutionDueIso(nowIso, priority),
        first_response_due_at: computeFirstResponseDueIso(nowIso, priority),
      })
      .select("id, ticket_number")
      .single();
    if (tErr) throw tErr;
    ticketId = (ticket as { id: string }).id;
    created = true;

    const { data: msg } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        user_id: requester.user_id,
        message: plain || subject,
        is_internal: false,
      })
      .select("id")
      .single();

    await attachZohoFilesToSupportMessage(supabase, {
      connection: params.connection,
      token: params.token,
      folderId: params.folderId,
      row: params.row,
      zohoMessageId,
      ticketId,
      supportTicketMessageId: (msg as { id?: string })?.id,
      requesterUserId: requester.user_id,
    });

    await supabase
      .from("support_tickets")
      .update({
        last_message_at: nowIso,
        last_message_from: "customer",
        updated_at: nowIso,
      })
      .eq("id", ticketId);

    await supabase.from("support_mail_messages").insert({
      mailbox_id: mailbox.id,
      zoho_message_id: zohoMessageId,
      zoho_thread_id: threadId,
      zoho_folder_id: params.folderId,
      rfc_message_id: rfcMessageId,
      ticket_id: ticketId,
      support_ticket_message_id: (msg as { id?: string })?.id ?? null,
      direction: "inbound",
      from_address: fromAddress,
      to_address: params.row.toAddress ?? null,
      cc_address: params.row.ccAddress ?? null,
      subject,
      body_html: htmlRaw || null,
      received_at: new Date(parseReceivedMs(params.row)).toISOString(),
      delivery_status: "sent",
    });

    params.counts.imported += 1;

    if (mailbox.ack_enabled) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: ackRecent } = await supabase
        .from("support_mail_ack_log")
        .select("id")
        .eq("mailbox_id", mailbox.id)
        .eq("sender_address", fromAddress)
        .gte("sent_at", hourAgo)
        .limit(1)
        .maybeSingle();
      if (!ackRecent?.id) {
        try {
          await sendAcknowledgement(supabase, {
            mailbox,
            connection: params.connection,
            token: params.token,
            inboundMessageId: zohoMessageId,
            toAddress: fromAddress,
            ticketNumber: String((ticket as { ticket_number?: string }).ticket_number ?? ticketId),
          });
          await supabase.from("support_ticket_messages").insert({
            ticket_id: ticketId,
            user_id: null,
            message: mailbox.ack_body?.replace(/\{ticket_number\}/g, String((ticket as { ticket_number?: string }).ticket_number)) ?? "Automatic acknowledgement sent.",
            is_internal: false,
            is_auto_reply: true,
          });
        } catch {
          /* ack failure must not fail ingest */
        }
      }
    }

    try {
      await startSupportTriageForTicket(ticketId);
    } catch {
      /* triage best-effort */
    }
    try {
      const staffIds = await resolveSupportTicketStaffRecipients(null);
      await notifySupportStaffInboxActivity(
        staffIds,
        String((ticket as { ticket_number?: string }).ticket_number ?? ticketId),
        `New email ticket: ${subject.slice(0, 200)}`,
        ticketId,
        ["email", "push"],
      );
    } catch {
      /* notify best-effort */
    }
    return;
  }

  const { data: msg } = await supabase
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      user_id: requester.user_id,
      message: plain || subject,
      is_internal: false,
    })
    .select("id")
    .single();

  await attachZohoFilesToSupportMessage(supabase, {
    connection: params.connection,
    token: params.token,
    folderId: params.folderId,
    row: params.row,
    zohoMessageId,
    ticketId,
    supportTicketMessageId: (msg as { id?: string })?.id,
    requesterUserId: requester.user_id,
  });

  const st = await supabase.from("support_tickets").select("status").eq("id", ticketId).maybeSingle();
  const status = String((st.data as { status?: string } | null)?.status ?? "open");
  const reopen = ["waiting_customer", "resolved", "closed"].includes(status);
  await supabase
    .from("support_tickets")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_from: "customer",
      status: reopen ? "open" : status,
      updated_at: new Date().toISOString(),
      zoho_thread_id: threadId ?? undefined,
    })
    .eq("id", ticketId);

  await supabase.from("support_mail_messages").insert({
    mailbox_id: mailbox.id,
    zoho_message_id: zohoMessageId,
    zoho_thread_id: threadId,
    zoho_folder_id: params.folderId,
    rfc_message_id: rfcMessageId,
    ticket_id: ticketId,
    support_ticket_message_id: (msg as { id?: string })?.id ?? null,
    direction: "inbound",
    from_address: fromAddress,
    subject,
    body_html: htmlRaw || null,
    received_at: new Date(parseReceivedMs(params.row)).toISOString(),
    delivery_status: "sent",
  });

  params.counts.appended += 1;
  try {
    const staffIds = await resolveSupportTicketStaffRecipients(ticketId);
    await notifySupportStaffInboxActivity(
      staffIds,
      ticketNumberToken ?? ticketId,
      `Customer replied by email: ${subject.slice(0, 200)}`,
      ticketId,
      ["email", "push"],
    );
  } catch {
    /* best-effort */
  }
  void created;
}

async function purgeOldMailHtml(supabase: SupabaseClient, connection: ConnectionRow): Promise<void> {
  const cutoff = new Date(Date.now() - connection.html_retention_days * 86400_000).toISOString();
  await supabase
    .from("support_mail_messages")
    .update({ body_html: null })
    .lt("created_at", cutoff)
    .not("body_html", "is", null);
}

export async function syncZohoSupportInbox(
  supabase: SupabaseClient,
  opts?: { connectionId?: string; mailboxId?: string },
): Promise<SyncZohoInboxResult> {
  const totals = { connections: 0, imported: 0, appended: 0, skipped: 0, failed: 0 };

  let connQuery = supabase.from("support_zoho_connections").select("*").eq("enabled", true);
  if (opts?.connectionId) connQuery = connQuery.eq("id", opts.connectionId);
  const { data: connections, error: cErr } = await connQuery;
  if (cErr) throw cErr;

  for (const connRaw of connections ?? []) {
    const connection = connRaw as ConnectionRow;
    if (connection.auth_status === "revoked") continue;

    let mbQuery = supabase
      .from("support_mailboxes")
      .select("*")
      .eq("connection_id", connection.id)
      .eq("inbound_enabled", true);
    if (opts?.mailboxId) mbQuery = mbQuery.eq("id", opts.mailboxId);
    const { data: mailboxesRaw, error: mErr } = await mbQuery;
    if (mErr) throw mErr;
    const mailboxes = (mailboxesRaw ?? []) as MailboxRow[];
    if (mailboxes.length === 0) continue;

    totals.connections += 1;
    let token: string;
    try {
      ({ token } = await getZohoAccessTokenForConnection(supabase, connection.id));
    } catch (err) {
      if (err instanceof ZohoMailApiError && !err.isRevoked) {
        await supabase
          .from("support_zoho_connections")
          .update({ last_error: err.message })
          .eq("id", connection.id);
      }
      continue;
    }

    if (!connection.zoho_account_id) continue;

    const folders = await listZohoFolders(
      connection.data_center,
      token,
      connection.zoho_account_id,
    );

    const folderGroups = new Map<string, MailboxRow[]>();
    for (const mb of mailboxes) {
      const folderId = resolveInboxFolderId(folders, mb.inbox_folder_id);
      if (!folderId) continue;
      const list = folderGroups.get(folderId) ?? [];
      list.push(mb);
      folderGroups.set(folderId, list);
    }

    for (const [folderId, mbs] of folderGroups) {
      const { data: cursorRow } = await supabase
        .from("support_mail_folder_cursors")
        .select("last_received_time_ms")
        .eq("connection_id", connection.id)
        .eq("folder_id", folderId)
        .maybeSingle();

      const lookbackMs = Math.max(...mbs.map((m) => m.lookback_hours)) * 3600_000;
      const nowMs = Date.now();
      let cursorMs = (cursorRow as { last_received_time_ms?: number } | null)?.last_received_time_ms ?? nowMs;
      if (!cursorRow && lookbackMs > 0) {
        cursorMs = nowMs - lookbackMs;
      } else if (!cursorRow) {
        cursorMs = nowMs;
      }

      const windowStartMs = Math.max(0, cursorMs - OVERLAP_MS);
      const collected: ZohoMessageListRow[] = [];
      let start = 1;
      for (let page = 0; page < connection.poll_page_cap; page++) {
        let rows: ZohoMessageListRow[];
        try {
          rows = await listZohoMessages(connection.data_center, token, connection.zoho_account_id, {
            folderId,
            start,
            limit: 200,
          });
        } catch (err) {
          if (err instanceof ZohoMailApiError && err.isThrottle) {
            await supabase
              .from("support_zoho_connections")
              .update({ last_error: err.message })
              .eq("id", connection.id);
            break;
          }
          throw err;
        }
        if (rows.length === 0) break;
        for (const row of rows) {
          const received = parseReceivedMs(row);
          if (received >= windowStartMs) collected.push(row);
        }
        const oldest = parseReceivedMs(rows[rows.length - 1]!);
        if (oldest < windowStartMs) break;
        start += rows.length;
      }

      collected.sort((a, b) => parseReceivedMs(a) - parseReceivedMs(b));
      const cap = connection.max_messages_per_run;
      const batch = collected.slice(0, cap);

      const counts = { imported: 0, appended: 0, skipped: 0, failed: 0 };
      for (const row of batch) {
        await processOneMessage(supabase, {
          connection,
          token,
          folderId,
          row,
          mailboxes: mbs,
          counts,
        });
      }

      if (batch.length > 0) {
        const lastMs = parseReceivedMs(batch[batch.length - 1]!);
        await supabase.from("support_mail_folder_cursors").upsert({
          connection_id: connection.id,
          folder_id: folderId,
          last_received_time_ms: lastMs,
          updated_at: new Date().toISOString(),
        });
      }

      totals.imported += counts.imported;
      totals.appended += counts.appended;
      totals.skipped += counts.skipped;
      totals.failed += counts.failed;

      for (const mb of mbs) {
        await supabase
          .from("support_mailboxes")
          .update({
            last_sync_at: new Date().toISOString(),
            last_run_imported: counts.imported,
            last_run_appended: counts.appended,
            last_run_skipped: counts.skipped,
            last_run_failed: counts.failed,
          })
          .eq("id", mb.id);
      }
    }

    await purgeOldMailHtml(supabase, connection);
  }

  try {
    const { writeAuditLog } = await import("@/lib/audit/audit");
    await writeAuditLog({
      actor_user_id: null,
      actor_role: "system",
      action: "admin.integrations.zoho_mail.sync_completed",
      entity_type: "support_zoho_connections",
      entity_id: opts?.connectionId ?? null,
      module: "integrations",
      risk_level: "low",
      retention_tier: "routine",
      metadata: totals,
    });
  } catch {
    /* best-effort */
  }

  return totals;
}
