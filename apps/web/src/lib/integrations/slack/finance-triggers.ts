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

export async function slackNotifyPayoutFailed(
  request: NextRequest,
  payout: {
    id: string;
    provider_id?: string | null;
    provider_name?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    failure_reason?: string | null;
  }
) {
  const tenantId = await resolveAdminApiTenantId(request);
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_PAYOUT_EXCEPTION,
    dedupeKey: `payout:${payout.id}:failed`,
    entityType: "payout",
    entityId: payout.id,
    title: "Payout exception needs review",
    detailLines: [
      payout.provider_name || (payout.provider_id ? `Provider: ${payout.provider_id.slice(0, 8)}...` : "Provider: unknown"),
      `Amount: ${payout.currency || "ZAR"} ${payout.amount ?? "unknown"}`,
      payout.failure_reason ? `Reason: ${payout.failure_reason}` : "Reason: not provided",
      "Action: review payout status and provider bank details",
    ],
    actionUrl: "/payouts",
  });
}
