import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

/** Agent proposed an action that needs human approval in the Agentic Console inbox. */
export function slackNotifyAgentActionProposed(params: {
  tenantId: string;
  actionId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  riskLevel: number;
  reasoningSummary?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_ACTION_PROPOSED,
    dedupeKey: `agent_action:${params.actionId}:proposed`,
    entityType: "agent_action",
    entityId: params.actionId,
    title: "Agent action awaiting approval",
    detailLines: [
      `Type: ${params.actionType}`,
      `Target: ${params.targetType}/${params.targetId.slice(0, 8)}…`,
      `Risk level: ${params.riskLevel}`,
      params.reasoningSummary ? `Reasoning: ${params.reasoningSummary.slice(0, 200)}` : null,
      "Action: review in Admin → Control plane → Agentic Console",
    ].filter(Boolean) as string[],
    actionUrl: "/control-plane/modules/agents",
  }).catch((err) => {
    console.error("[slack] agent action proposed notify error", err);
  });
}

/** Agent workflow run failed (cron or event-triggered). */
export function slackNotifyAgentRunFailed(params: {
  tenantId: string;
  runId: string;
  workflowType: string;
  error: string;
}) {
  void tryNotifySlackEvent({
    tenantId: params.tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_RUN_FAILED,
    dedupeKey: `agent_run:${params.runId}:failed`,
    entityType: "agent_run",
    entityId: params.runId,
    title: "Agent run failed",
    detailLines: [
      `Workflow: ${params.workflowType}`,
      `Error: ${params.error.slice(0, 300)}`,
      "Action: inspect in Admin → Control plane → Agentic Console → Live runs",
    ],
    actionUrl: "/control-plane/modules/agents",
  }).catch((err) => {
    console.error("[slack] agent run failed notify error", err);
  });
}

/** Emergency kill switch toggled — highest-signal alert for the ops team. */
export function slackNotifyAgentEmergencyActivated(params: {
  tenantId?: string | null;
  environment: string;
  activatedBy: string;
  controls: Record<string, boolean>;
  reason?: string | null;
}) {
  const active = Object.entries(params.controls)
    .filter(([, v]) => v)
    .map(([k]) => k.replace(/_/g, " "));
  void tryNotifySlackEvent({
    tenantId: params.tenantId ?? "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_EMERGENCY_ACTIVATED,
    dedupeKey: `agent_emergency:${params.environment}:${active.join(",") || "cleared"}`,
    entityType: "agent_emergency_controls",
    entityId: params.environment,
    title: active.length > 0 ? "🚨 Agent emergency controls activated" : "Agent emergency controls cleared",
    detailLines: [
      `Environment: ${params.environment}`,
      active.length > 0 ? `Active: ${active.join(", ")}` : "All switches off",
      `By: ${params.activatedBy.slice(0, 8)}…`,
      params.reason ? `Reason: ${params.reason}` : null,
      "Action: Admin → Control plane → Agentic Console",
    ].filter(Boolean) as string[],
    actionUrl: "/control-plane/modules/agents",
  }).catch((err) => {
    console.error("[slack] agent emergency notify error", err);
  });
}
