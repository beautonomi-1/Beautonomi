import { adminSpaAbsoluteUrl } from "@/lib/adminSpaPath";

/** Shareable admin URL for a ticket message (works from inbox panel copy). */
export function supportTicketMessageHref(ticketId: string, messageId: string): string {
  const path = `/admin/support-tickets/${encodeURIComponent(ticketId)}`;
  const hash = `#message-${messageId}`;
  if (typeof window === "undefined") return `${path}${hash}`;
  return `${adminSpaAbsoluteUrl(path)}${hash}`;
}
