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

/** When a provider submits a new payout request (row is `pending`). */
export async function slackNotifyPayoutRequested(
  request: NextRequest,
  payout: {
    id: string;
    provider_id?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    payout_number?: string | null;
  },
  options?: { tenantId?: string; providerName?: string | null },
) {
  const tenantId = options?.tenantId ?? (await resolveAdminApiTenantId(request));
  const amt = payout.amount != null ? String(payout.amount) : "unknown";
  const cur = payout.currency || "ZAR";
  const label =
    options?.providerName ??
    (payout.provider_id ? `Provider ${String(payout.provider_id).slice(0, 8)}…` : "Provider");
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey: SLACK_EVENT_KEYS.FINANCE_PAYOUT_REQUESTED,
    dedupeKey: `payout:${payout.id}:api-requested`,
    entityType: "payout",
    entityId: payout.id,
    title: `New payout request ${payout.payout_number || payout.id}`,
    detailLines: [label, `Amount: ${cur} ${amt}`, "Action: review in Admin → Payouts"],
    actionUrl: "/payouts",
  });
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
