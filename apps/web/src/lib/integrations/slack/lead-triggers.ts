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

export async function slackNotifyLeadCreated(
  request: NextRequest,
  lead: { id: string; business_name?: string | null; assigned_to?: string | null }
) {
  if (lead.assigned_to) return;
  const tenantId = await resolveAdminApiTenantId(request);
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_CREATED_UNASSIGNED,
    dedupeKey: `lead:${lead.id}:created`,
    entityType: "provider_lead",
    entityId: lead.id,
    title: `New unassigned lead`,
    detailLines: [lead.business_name || "(unnamed)", `Lead ID: ${lead.id.slice(0, 8)}…`],
    actionUrl: `/provider-ops/leads/${lead.id}`,
  });
}

export async function slackNotifyLeadReassigned(
  request: NextRequest,
  lead: { id: string; business_name?: string | null },
  assignedTo: string | null,
  previousAssigned: string | null
) {
  if (String(assignedTo || "") === String(previousAssigned || "")) return;
  const tenantId = await resolveAdminApiTenantId(request);
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_REASSIGNED,
    dedupeKey: `lead:${lead.id}:from:${previousAssigned || "none"}:to:${assignedTo || "none"}`,
    entityType: "provider_lead",
    entityId: lead.id,
    title: `Lead reassigned`,
    detailLines: [
      lead.business_name || "(unnamed)",
      assignedTo ? `Now assigned (user id): ${assignedTo.slice(0, 8)}…` : "Unassigned",
    ],
    actionUrl: `/provider-ops/leads/${lead.id}`,
  });
}

export async function slackNotifyLeadMilestone(
  request: NextRequest,
  lead: { id: string; business_name?: string | null },
  stage: string,
  previousStage?: string | null
) {
  if (stage !== "won" && stage !== "matched") return;
  const tenantId = await resolveAdminApiTenantId(request);
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.PROVIDER_LEAD_MILESTONE,
    dedupeKey: `lead:${lead.id}:milestone:${stage}`,
    entityType: "provider_lead",
    entityId: lead.id,
    title: `Provider lead milestone: ${stage}`,
    detailLines: [
      lead.business_name || "(unnamed)",
      previousStage ? `Stage: ${previousStage} → ${stage}` : `Stage: ${stage}`,
      "Action: confirm onboarding handoff is complete",
    ],
    actionUrl: `/provider-ops/leads/${lead.id}`,
  });
}
