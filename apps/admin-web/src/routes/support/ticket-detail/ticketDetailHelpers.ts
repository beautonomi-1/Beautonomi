export const STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export type AttachmentItem = { url: string; name?: string; type?: string; size?: number };

export type TicketRow = Record<string, unknown> & {
  id?: string;
  ticket_number?: string;
  subject?: string;
  description?: string;
  category?: string | null;
  requester_type?: string | null;
  support_context_type?: string | null;
  support_context_id?: string | null;
  support_context_label?: string | null;
  priority?: string;
  status?: string;
  user_id?: string | null;
  provider_id?: string | null;
  assigned_to?: string | null;
  tags?: string[] | null;
  sla_resolution_due_at?: string | null;
  first_response_due_at?: string | null;
  first_staff_reply_at?: string | null;
  last_customer_reply_at?: string | null;
  last_message_from?: string | null;
  last_message_at?: string | null;
  handling_mode?: string | null;
  attention_state?: string | null;
  sla_state?: string | null;
  created_at?: string;
  updated_at?: string;
  user?: {
    id?: string;
    email?: string;
    full_name?: string | null;
    phone?: string | null;
    role?: string | null;
    is_active?: boolean | null;
    created_at?: string | null;
  } | null;
  provider?: {
    id?: string;
    business_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
    user_id?: string | null;
    created_at?: string | null;
  } | null;
  assigned_user?: { id?: string; email?: string; full_name?: string | null } | null;
  channel?: "app" | "email" | null;
  requester_email?: string | null;
  tenant_id?: string | null;
  tenant?: { name?: string; slug?: string; region_code?: string | null } | null;
  mailbox?: { address?: string; outbound_enabled?: boolean } | null;
  csat_score?: number | null;
  csat_comment?: string | null;
  csat_submitted_at?: string | null;
  csat_agent_id?: string | null;
  csat_agent?: { id?: string; full_name?: string | null; email?: string | null } | null;
};

export type MessageRow = Record<string, unknown> & {
  id?: string;
  user_id?: string | null;
  message?: string;
  is_internal?: boolean;
  is_auto_reply?: boolean;
  author_kind?: string | null;
  email_delivery_status?: string | null;
  created_at?: string;
  attachments?: unknown;
  user?: { email?: string; full_name?: string | null } | null;
};

export type NoteRow = Record<string, unknown> & {
  id?: string;
  note?: string;
  is_private?: boolean;
  created_at?: string;
  user?: { email?: string; full_name?: string | null } | null;
};

export type ThreadItem =
  | { kind: "message"; id: string; created_at?: string; row: MessageRow }
  | { kind: "note"; id: string; created_at?: string; row: NoteRow };

export function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function isSlaBreached(ticket: TicketRow): boolean {
  const due = ticket.sla_resolution_due_at;
  if (!due) return false;
  const st = str(ticket.status);
  if (st === "resolved" || st === "closed") return false;
  return new Date(due).getTime() < Date.now();
}

export function priorityPillClass(p: string): string {
  if (p === "urgent") return "bg-red-100 text-red-900";
  if (p === "high") return "bg-orange-100 text-orange-900";
  if (p === "low") return "bg-slate-100 text-slate-800";
  return "bg-gray-100 text-gray-900";
}

export function attachmentsFromRow(raw: unknown): AttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: AttachmentItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    if (!url) continue;
    out.push({
      url,
      name: typeof o.name === "string" ? o.name : undefined,
      type: typeof o.type === "string" ? o.type : undefined,
      size: typeof o.size === "number" ? o.size : undefined,
    });
  }
  return out;
}

export function isImageAttachment(att: AttachmentItem): boolean {
  return Boolean(att.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(att.url));
}

export function formatFileSize(size?: number): string {
  if (size == null) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function messageDayLabel(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: today.getFullYear() === d.getFullYear() ? undefined : "numeric",
  });
}

export function relativeTime(value?: string): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

export function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export type AttentionBanner = { text: string; style: "red" | "amber" | "blue" } | null;

export function computeAttentionBanner(ticket: TicketRow, nowMs = Date.now()): AttentionBanner {
  const attentionState = str(ticket.attention_state);
  const slaState = str(ticket.sla_state);
  const ticketStatus = str(ticket.status);
  const firstRespDue = ticket.first_response_due_at ? new Date(str(ticket.first_response_due_at)) : null;
  const slaDue = ticket.sla_resolution_due_at ? new Date(str(ticket.sla_resolution_due_at)) : null;
  const handlingMode = str(ticket.handling_mode ?? "human");

  const isDone = ticketStatus === "resolved" || ticketStatus === "closed";
  if (isDone) return null;
  if (handlingMode === "assistant") {
    return { text: "AI handling — bot is replying; human queue after handoff", style: "blue" };
  }
  if (attentionState === "first_response_overdue" && firstRespDue) {
    const overdueMs = nowMs - firstRespDue.getTime();
    const overdueH = Math.floor(overdueMs / 3600_000);
    const overdueText = overdueH > 0 ? ` by ${overdueH}h` : "";
    return {
      text: `First response overdue${overdueText} — customer has been waiting for your first reply`,
      style: "red",
    };
  }
  if (slaState === "breached" && slaDue) {
    const overdueMs = nowMs - slaDue.getTime();
    const overdueH = Math.floor(overdueMs / 3600_000);
    const overdueD = Math.floor(overdueH / 24);
    const overdueText =
      overdueD > 0 ? ` (${overdueD}d ${overdueH % 24}h)` : overdueH > 0 ? ` (${overdueH}h)` : "";
    return { text: `Resolution SLA breached${overdueText}`, style: "red" };
  }
  if (attentionState === "awaiting_agent") {
    return { text: "Awaiting your reply — customer replied last", style: "blue" };
  }
  if (slaState === "at_risk" && slaDue) {
    const remainMs = slaDue.getTime() - nowMs;
    const remainH = Math.ceil(remainMs / 3600_000);
    return { text: `SLA due in ${remainH}h — at risk`, style: "amber" };
  }
  return null;
}

/** Below this container width the sidebar cannot sit beside a readable thread (20rem sidebar + ~26rem thread). */
export const TICKET_DETAIL_WIDE_MIN_PX = 760;

export function isWideTicketLayout(containerWidth: number): boolean {
  return containerWidth >= TICKET_DETAIL_WIDE_MIN_PX;
}

const THREAD_NEAR_BOTTOM_PX = 120;

/** Jump to the newest message on ticket open, or on new messages only when the agent is already near the bottom. */
export function shouldAutoScrollThread(input: {
  ticketChanged: boolean;
  prevItemCount: number;
  nextItemCount: number;
  distanceFromBottom: number;
}): boolean {
  if (input.ticketChanged) return true;
  if (input.nextItemCount <= input.prevItemCount) return false;
  return input.distanceFromBottom <= THREAD_NEAR_BOTTOM_PX;
}

export function nextQueueButtonLabel(nextTicketId: string | null): string {
  return nextTicketId ? "Next in queue" : "Back to queue";
}

export type DeliveryBadge = { label: string; className: string } | null;

export function deliveryStatusBadge(status: string | null | undefined): DeliveryBadge {
  const s = status?.trim().toLowerCase();
  if (!s || s === "skipped") return null;
  if (s === "failed") {
    return { label: "Send failed", className: "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800" };
  }
  if (s === "sending") {
    return { label: "Sending…", className: "rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800" };
  }
  if (s === "sent") {
    return { label: "Sent", className: "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600" };
  }
  return null;
}

/** Show ticket description as "Original request" when it is not duplicated in the first customer message. */
export function shouldShowOriginalRequest(
  description: string,
  messages: MessageRow[],
  customerUserId: string | null,
): boolean {
  const desc = description.trim();
  if (!desc) return false;
  const firstCustomer = messages.find((m) => {
    if (m.is_internal) return false;
    const uid = m.user_id == null ? null : str(m.user_id);
    const isAssistant = str(m.author_kind) === "assistant";
    return !isAssistant && customerUserId !== null && uid === customerUserId;
  });
  if (!firstCustomer) return true;
  const firstBody = str(firstCustomer.message).trim();
  if (!firstBody) return true;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(desc) !== norm(firstBody);
}

export function buildThreadItems(messages: MessageRow[], notes: NoteRow[]): ThreadItem[] {
  const items: ThreadItem[] = [
    ...messages.map((m) => ({
      kind: "message" as const,
      id: str(m.id) || `msg-${str(m.created_at)}`,
      created_at: m.created_at ? str(m.created_at) : undefined,
      row: m,
    })),
    ...notes.map((n) => ({
      kind: "note" as const,
      id: str(n.id) || `note-${str(n.created_at)}`,
      created_at: n.created_at ? str(n.created_at) : undefined,
      row: n,
    })),
  ];
  return items.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
}
