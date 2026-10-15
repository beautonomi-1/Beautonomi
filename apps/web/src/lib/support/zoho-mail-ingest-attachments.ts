import type { SupabaseClient } from "@supabase/supabase-js";
import {
  downloadZohoMessageAttachment,
  listZohoMessageAttachments,
  zohoListRowHasAttachment,
  ZohoMailApiError,
  type ZohoMessageListRow,
} from "@/lib/integrations/zoho-mail";
import {
  SUPPORT_TICKET_MAX_ATTACHMENTS_PER_MESSAGE,
  guessMimeTypeFromFileName,
  uploadSupportTicketBuffers,
  validateSupportTicketAttachmentCandidate,
  type SupportTicketAttachmentMeta,
} from "@/lib/support/support-ticket-attachment-upload";

export async function ingestZohoInboundAttachments(
  supabase: SupabaseClient,
  params: {
    mailBase: string;
    token: string;
    accountId: string;
    folderId: string;
    zohoMessageId: string;
    listRow: Pick<ZohoMessageListRow, "hasAttachment">;
    ticketId: string;
    supportTicketMessageId: string;
    requesterUserId: string | null;
  },
): Promise<SupportTicketAttachmentMeta[]> {
  if (!zohoListRowHasAttachment(params.listRow)) {
    return [];
  }

  let attachments: Awaited<ReturnType<typeof listZohoMessageAttachments>>;
  try {
    attachments = await listZohoMessageAttachments(
      params.mailBase,
      params.token,
      params.accountId,
      params.folderId,
      params.zohoMessageId,
    );
  } catch (err) {
    console.warn("[zoho-ingest] attachmentinfo failed:", err instanceof Error ? err.message : err);
    return [];
  }

  if (attachments.length === 0) {
    return [];
  }

  const ownerSegment = params.requesterUserId ?? "email-ingest";
  const toUpload: { name: string; mimeType: string; buffer: Buffer }[] = [];

  for (const att of attachments.slice(0, SUPPORT_TICKET_MAX_ATTACHMENTS_PER_MESSAGE)) {
    const mimeType = guessMimeTypeFromFileName(att.attachmentName);
    if (att.attachmentSize > 0) {
      const preCheck = validateSupportTicketAttachmentCandidate({
        name: att.attachmentName,
        type: mimeType,
        size: att.attachmentSize,
      });
      if (preCheck) continue;
    } else {
      const typeCheck = validateSupportTicketAttachmentCandidate({
        name: att.attachmentName,
        type: mimeType,
        size: 1,
      });
      if (typeCheck) continue;
    }

    try {
      const buf = await downloadZohoMessageAttachment(
        params.mailBase,
        params.token,
        params.accountId,
        params.folderId,
        params.zohoMessageId,
        att.attachmentId,
      );
      const buffer = Buffer.from(buf);
      const postCheck = validateSupportTicketAttachmentCandidate({
        name: att.attachmentName,
        type: mimeType,
        size: buffer.byteLength,
      });
      if (postCheck) continue;
      toUpload.push({ name: att.attachmentName, mimeType, buffer });
    } catch (err) {
      if (err instanceof ZohoMailApiError && err.isThrottle) {
        console.warn("[zoho-ingest] attachment download throttled, stopping batch");
        break;
      }
      console.warn(
        `[zoho-ingest] attachment download failed (${att.attachmentName}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (toUpload.length === 0) {
    return [];
  }

  try {
    const uploaded = await uploadSupportTicketBuffers(supabase, {
      ticketId: params.ticketId,
      ownerSegment,
      files: toUpload,
    });
    if (uploaded.length > 0) {
      await supabase
        .from("support_ticket_messages")
        .update({ attachments: uploaded })
        .eq("id", params.supportTicketMessageId);
    }
    return uploaded;
  } catch (err) {
    console.warn("[zoho-ingest] attachment storage upload failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
