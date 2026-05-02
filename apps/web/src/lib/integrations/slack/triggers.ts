import type { NextRequest } from "next/server";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

export async function slackNotifyNewSupportTicket(
  request: NextRequest,
  ticket: {
    id: string;
    ticket_number?: string | null;
    subject?: string | null;
    priority?: string | null;
  }
) {
  const tenantId = await resolveAdminApiTenantId(request);
  const priority = String(ticket.priority || "");
  if (priority !== "urgent" && priority !== "high") return;
  const env = eventEnv();
  void tryNotifySlackEvent({
    tenantId,
    environment: env,
    eventKey:
      priority === "urgent"
        ? SLACK_EVENT_KEYS.SUPPORT_TICKET_URGENT_CREATED
        : SLACK_EVENT_KEYS.SUPPORT_TICKET_HIGH_CREATED,
    dedupeKey: `ticket:${ticket.id}:created:${priority}`,
    entityType: "support_ticket",
    entityId: ticket.id,
    title: `${priority === "urgent" ? "Urgent" : "High-priority"} support ticket ${ticket.ticket_number || ticket.id}`,
    detailLines: [ticket.subject || "(no subject)", `Priority: ${priority}`, "Action: triage and assign an owner"],
    actionUrl: `/support-tickets/${ticket.id}`,
  });
}

export async function slackNotifySupportTicketUpdated(
  request: NextRequest,
  ticket: {
    id: string;
    ticket_number?: string | null;
    priority?: string | null;
    status?: string | null;
    assigned_to?: string | null;
    sla_resolution_due_at?: string | null;
  },
  previous?: {
    priority?: string | null;
    status?: string | null;
    resolved_at?: string | null;
  }
) {
  const tenantId = await resolveAdminApiTenantId(request);
  const env = eventEnv();
  const pr = String(ticket.priority || "");
  const st = String(ticket.status || "");

  if ((pr === "high" || pr === "urgent") && !ticket.assigned_to && st !== "resolved" && st !== "closed") {
    void tryNotifySlackEvent({
      tenantId,
      environment: env,
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_HIGH_UNASSIGNED,
      dedupeKey: `ticket:${ticket.id}:unassigned`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: `Unassigned ${pr} ticket ${ticket.ticket_number || ticket.id}`,
      detailLines: [pr === "urgent" ? "Priority: urgent" : "Priority: high", `Status: ${st}`],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const previousPriority = String(previous?.priority || "");
  if (
    (pr === "high" || pr === "urgent") &&
    previousPriority &&
    previousPriority !== pr &&
    previousPriority !== "high" &&
    previousPriority !== "urgent"
  ) {
    void tryNotifySlackEvent({
      tenantId,
      environment: env,
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_ESCALATED,
      dedupeKey: `ticket:${ticket.id}:escalated:${previousPriority}:to:${pr}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: `Support ticket escalated — ${ticket.ticket_number || ticket.id}`,
      detailLines: [`Priority: ${previousPriority} → ${pr}`, `Status: ${st}`, "Action: review owner and SLA"],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const previousStatus = String(previous?.status || "");
  if (
    (previousStatus === "resolved" || previousStatus === "closed" || previous?.resolved_at) &&
    (st === "open" || st === "in_progress" || st === "waiting_customer")
  ) {
    void tryNotifySlackEvent({
      tenantId,
      environment: env,
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_REOPENED,
      dedupeKey: `ticket:${ticket.id}:reopened:${ticket.sla_resolution_due_at || "no-sla"}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: `Support ticket reopened — ${ticket.ticket_number || ticket.id}`,
      detailLines: [`Status: ${previousStatus || "resolved"} → ${st}`, `Priority: ${pr || "unknown"}`, "Action: reassess next step"],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }

  const due = ticket.sla_resolution_due_at ? new Date(ticket.sla_resolution_due_at).getTime() : null;
  if (
    due &&
    due < Date.now() &&
    st !== "resolved" &&
    st !== "closed"
  ) {
    void tryNotifySlackEvent({
      tenantId,
      environment: env,
      eventKey: SLACK_EVENT_KEYS.SUPPORT_TICKET_OVERDUE,
      dedupeKey: `ticket:${ticket.id}:sla:${ticket.sla_resolution_due_at}`,
      entityType: "support_ticket",
      entityId: ticket.id,
      title: `SLA overdue — ${ticket.ticket_number || ticket.id}`,
      detailLines: [`Due: ${ticket.sla_resolution_due_at}`, `Status: ${st}`],
      actionUrl: `/support-tickets/${ticket.id}`,
    });
  }
}
