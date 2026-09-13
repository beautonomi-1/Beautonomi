import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function slackNotifyFxRatesStale(params: {
  stale: string[];
  warnings: string[];
}) {
  if (params.stale.length === 0 && params.warnings.length === 0) return;

  const lines = [
    params.stale.length > 0 ? `Stale required pairs: ${params.stale.join(", ")}` : null,
    params.warnings.length > 0 ? `Warnings: ${params.warnings.slice(0, 5).join("; ")}` : null,
    "Action: Finance → FX rates; Fetch now or post a manual override",
  ].filter(Boolean) as string[];

  await tryNotifySlackEvent({
    tenantId: "platform",
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_FX_STALE,
    dedupeKey: `finance:fx:stale:${dayKey()}`,
    entityType: "fx_reference_rates",
    entityId: "hq",
    title: "FX reference rates stale or incomplete",
    detailLines: lines,
    actionUrl: "/fx-rates",
  }).catch((err) => {
    console.error("[slack] fx stale notify error", err);
  });
}
