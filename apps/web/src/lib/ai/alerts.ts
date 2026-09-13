import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

export function slackNotifyAiEmergencyActivated(params: {
  environment: string;
  activatedBy: string;
  controls: Record<string, boolean>;
  reason?: string | null;
}) {
  void tryNotifySlackEvent({
    tenantId: null,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_EMERGENCY_ACTIVATED,
    dedupeKey: `ai_emergency:${params.environment}:${Date.now()}`,
    entityType: "ai_emergency_controls",
    entityId: params.environment,
    title: "AI emergency controls activated",
    detailLines: [
      `Environment: ${params.environment}`,
      `Stop all calls: ${params.controls.stop_all_calls ?? false}`,
      `Force template fallback: ${params.controls.force_template_fallback ?? false}`,
      params.reason ? `Reason: ${params.reason.slice(0, 300)}` : null,
      "Action: Admin → Control plane → Integrations → AI providers",
    ].filter(Boolean) as string[],
    actionUrl: "/control-plane/integrations/ai",
  }).catch((err) => {
    console.error("[slack] ai emergency notify error", err);
  });
}

export function slackNotifyAiBudgetThreshold(params: {
  environment: string;
  scope: "daily" | "monthly" | "tenant";
  spentUsd: number;
  capUsd: number;
  thresholdPct: number;
}) {
  void tryNotifySlackEvent({
    tenantId: null,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_RUN_FAILED,
    dedupeKey: `ai_budget:${params.environment}:${params.scope}:${new Date().toISOString().slice(0, 10)}`,
    entityType: "ai_module_config",
    entityId: params.environment,
    title: "AI spend threshold reached",
    detailLines: [
      `Scope: ${params.scope}`,
      `Spent: $${params.spentUsd.toFixed(4)} / $${params.capUsd.toFixed(2)} (${params.thresholdPct}%)`,
      "Action: review AI budgets in Control plane",
    ],
    actionUrl: "/control-plane/integrations/ai",
  }).catch((err) => {
    console.error("[slack] ai budget notify error", err);
  });
}

export function slackNotifyAiBreakerOpen(params: {
  modelId: string;
  environment: string;
}) {
  void tryNotifySlackEvent({
    tenantId: null,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.AGENT_RUN_FAILED,
    dedupeKey: `ai_breaker:${params.modelId}:${new Date().toISOString().slice(0, 13)}`,
    entityType: "ai_model_catalog",
    entityId: params.modelId,
    title: "AI circuit breaker opened",
    detailLines: [`Model: ${params.modelId}`, `Environment: ${params.environment}`],
    actionUrl: "/control-plane/integrations/ai",
  }).catch((err) => {
    console.error("[slack] ai breaker notify error", err);
  });
}
