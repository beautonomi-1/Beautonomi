/**
 * Maps stored notification `link` / `action_url` + `data` to real customer web routes.
 * Templates historically used paths that do not exist (e.g. `/support/tickets/...`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function deriveCustomerNotificationHref(notification: {
  type?: string | null;
  link?: string | null;
  action_url?: string | null;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): string | undefined {
  const data = { ...(notification.data ?? {}), ...(notification.metadata ?? {}) };
  const nType = (notification.type ?? "").toLowerCase();
  const templateKey =
    typeof data.template_key === "string" ? data.template_key.toLowerCase() : "";

  if (
    nType === "identity_verification_approved" ||
    nType === "identity_verification_rejected" ||
    nType === "account_verification" ||
    templateKey === "identity_verification_approved" ||
    templateKey === "identity_verification_rejected"
  ) {
    return "/account-settings/identity-verification";
  }
  const bookingId =
    typeof data.booking_id === "string" && data.booking_id.trim()
      ? data.booking_id.trim()
      : typeof data.bookingId === "string" && data.bookingId.trim()
        ? data.bookingId.trim()
        : null;
  const conversationId =
    typeof data.conversation_id === "string" && data.conversation_id.trim()
      ? data.conversation_id.trim()
      : typeof data.conversationId === "string" && data.conversationId.trim()
        ? data.conversationId.trim()
        : null;
  const ticketId =
    typeof data.ticket_id === "string" && data.ticket_id.trim()
      ? data.ticket_id.trim()
      : null;
  // Prefer explicit structured IDs over template/action URLs. Older templates
  // sometimes stored provider/admin web paths or `/bookings/:id`, which can
  // send customers to the error boundary even though the notification has the
  // correct customer booking id in metadata.
  if (bookingId && isUuid(bookingId)) {
    return `/account-settings/bookings/${bookingId}`;
  }
  if (conversationId && isUuid(conversationId)) {
    return `/account-settings/messages?conversation=${encodeURIComponent(conversationId)}`;
  }
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

  if (raw.startsWith("/bookings/") || raw.startsWith("/account-settings/bookings/")) {
    const seg = raw
      .replace(/^\/account-settings\/bookings\/?/, "")
      .replace(/^\/bookings\/?/, "")
      .split("/")
      .filter(Boolean)[0];
    if (seg && isUuid(seg)) return `/account-settings/bookings/${seg}`;
    return "/account-settings/bookings";
  }

  return raw;
}
