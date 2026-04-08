/**
 * Maps stored notification `link` / `action_url` + `data` to real customer web routes.
 * Templates historically used paths that do not exist (e.g. `/support/tickets/...`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function deriveCustomerNotificationHref(notification: {
  link?: string | null;
  action_url?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): string | undefined {
  const data = { ...(notification.data ?? {}), ...(notification.metadata ?? {}) };
  const ticketId =
    typeof data.ticket_id === "string" && data.ticket_id.trim()
      ? data.ticket_id.trim()
      : null;
  if (ticketId && isUuid(ticketId)) {
    return `/help/my-tickets/${ticketId}`;
  }

  let raw = (notification.link ?? notification.action_url ?? "").trim();
  if (!raw) return undefined;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return undefined;
    }
  }

  if (raw.startsWith("/support/tickets/") || raw === "/support/tickets/{{ticket_id}}") {
    const seg = raw.replace(/^\/support\/tickets\/?/, "").split("/").filter(Boolean)[0];
    if (seg && seg !== "{{ticket_id}}" && isUuid(seg)) {
      return `/help/my-tickets/${seg}`;
    }
    return "/help/my-tickets";
  }

  if (raw.startsWith("/messages/")) {
    const seg = raw.replace(/^\/messages\/?/, "").split("/").filter(Boolean)[0];
    if (seg && seg !== "{{conversation_id}}" && isUuid(seg)) {
      return `/account-settings/messages?conversation=${encodeURIComponent(seg)}`;
    }
    return "/account-settings/messages";
  }

  return raw;
}
