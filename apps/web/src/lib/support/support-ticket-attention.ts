/**
 * Pure attention-model helpers for support tickets (Step 3 of the enterprise
 * queue plan).  These functions are intentionally database-free: they accept a
 * plain object with the relevant ticket fields and return the computed signals
 * that drive queue ordering, badges, and banners in the admin SPA.
 *
 * Both the list API (where fields come from DB rows) and the detail view (where
 * fields come from the same row type) import from here, ensuring perfect
 * consistency.
 */

export type AttentionState =
  | "awaiting_agent"         // customer replied last — needs our response
  | "unassigned_new"         // new ticket, never touched, no assignee
  | "first_response_overdue" // first staff reply has not been sent and window expired
  | "sla_breached"           // resolution SLA passed
  | "sla_at_risk"            // resolution SLA will breach within 25% of window
  | "waiting_customer"       // staff replied last — waiting on customer
  | "assigned_idle"          // assigned but no urgency (everything looks fine)
  | "resolved";              // resolved or closed

export type SlaState = "none" | "ok" | "at_risk" | "breached";

export interface TicketAttentionInput {
  status: string | null | undefined;
  priority: string | null | undefined;
  last_message_from: string | null | undefined;
  last_message_at: string | null | undefined;
  first_staff_reply_at: string | null | undefined;
  first_response_due_at: string | null | undefined;
  sla_resolution_due_at: string | null | undefined;
  assigned_to: string | null | undefined;
  last_staff_view_at: string | null | undefined;
  /** needs_agent_response GENERATED column from DB — use when available. */
  needs_agent_response?: boolean | null;
}

export interface TicketAttentionResult {
  attention_state: AttentionState;
  sla_state: SlaState;
  /** True when customer replied after the last time an agent opened the ticket. */
  agent_unread: boolean;
}

const SLA_AT_RISK_FRACTION = 0.25; // < 25% of window remaining → at_risk

/** Map priority string to resolution SLA hours (mirrors support-ticket-sla.ts). */
function resolutionHours(priority: string | null | undefined): number {
  switch (priority) {
    case "urgent": return 4;
    case "high":   return 24;
    case "medium": return 72;
    case "low":    return 168;
    default:       return 72;
  }
}

function parseDateMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Compute derived attention fields for a single ticket row.
 * All values are based purely on the input — no I/O, no side effects.
 */
export function computeTicketAttention(
  ticket: TicketAttentionInput,
  nowMs: number = Date.now(),
): TicketAttentionResult {
  const status = ticket.status ?? "";
  const isDone = status === "resolved" || status === "closed";

  // ── sla_state ────────────────────────────────────────────────────────────
  let sla_state: SlaState = "none";
  if (!isDone && ticket.sla_resolution_due_at) {
    const dueMs = parseDateMs(ticket.sla_resolution_due_at);
    if (dueMs !== null) {
      if (nowMs >= dueMs) {
        sla_state = "breached";
      } else {
        const windowMs = resolutionHours(ticket.priority) * 3600_000;
        const remainingMs = dueMs - nowMs;
        sla_state = remainingMs < windowMs * SLA_AT_RISK_FRACTION ? "at_risk" : "ok";
      }
    }
  }

  // ── agent_unread ─────────────────────────────────────────────────────────
  const lastMsgFromCustomer = ticket.last_message_from === "customer";
  const lastMsgMs = parseDateMs(ticket.last_message_at);
  const lastStaffViewMs = parseDateMs(ticket.last_staff_view_at);
  const agent_unread =
    !isDone &&
    lastMsgFromCustomer &&
    lastMsgMs !== null &&
    (lastStaffViewMs === null || lastMsgMs > lastStaffViewMs);

  // ── attention_state ──────────────────────────────────────────────────────
  let attention_state: AttentionState;

  if (isDone) {
    attention_state = "resolved";
  } else if (sla_state === "breached") {
    attention_state = "sla_breached";
  } else {
    // Derive needs_agent_response locally if the DB-generated column is absent.
    const needsResponse =
      ticket.needs_agent_response ??
      (lastMsgFromCustomer || (status === "open" && !ticket.first_staff_reply_at));

    if (needsResponse) {
      // Distinguish: brand-new ticket vs. customer reply
      const isNewTicket = status === "open" && !ticket.first_staff_reply_at;
      const firstRespDueMs = parseDateMs(ticket.first_response_due_at);

      if (isNewTicket && firstRespDueMs !== null && nowMs >= firstRespDueMs) {
        attention_state = "first_response_overdue";
      } else if (isNewTicket && !ticket.assigned_to) {
        attention_state = "unassigned_new";
      } else {
        attention_state = "awaiting_agent";
      }
    } else if (sla_state === "at_risk") {
      // SLA at-risk floats above waiting_customer — agent must be aware
      // even when staff replied last.
      attention_state = "sla_at_risk";
    } else if (ticket.last_message_from === "staff") {
      attention_state = "waiting_customer";
    } else {
      attention_state = "assigned_idle";
    }
  }

  return { attention_state, sla_state, agent_unread };
}

/**
 * Convenience: compute and return individual fields for spreading into API
 * response objects or DB update payloads.
 */
export function computeTicketAttentionFields(
  ticket: TicketAttentionInput,
  nowMs?: number,
): {
  attention_state: AttentionState;
  sla_state: SlaState;
  agent_unread: boolean;
} {
  return computeTicketAttention(ticket, nowMs);
}
