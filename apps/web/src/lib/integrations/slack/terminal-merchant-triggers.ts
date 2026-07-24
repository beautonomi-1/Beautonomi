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

type ApplicationRow = {
  id: string;
  application_no: string;
  status: string;
  trading_name?: string | null;
  legal_name?: string | null;
};

type ProviderRow = {
  business_name?: string | null;
  tenant_id?: string | null;
};

async function notify(
  request: NextRequest,
  eventKey: (typeof SLACK_EVENT_KEYS)[keyof typeof SLACK_EVENT_KEYS],
  title: string,
  lines: string[],
  application: ApplicationRow,
  provider?: ProviderRow | null,
) {
  const tenantId = provider?.tenant_id ?? (await resolveAdminApiTenantId(request));
  void tryNotifySlackEvent({
    tenantId,
    environment: eventEnv(),
    eventKey,
    dedupeKey: `${eventKey}:${application.id}:${Date.now()}`,
    entityType: "terminal_merchant_applications",
    entityId: application.id,
    title,
    detailLines: lines,
    actionUrl: `/admin/commercial/terminal-onboarding/${application.id}`,
  });
}

export async function slackNotifyTerminalMerchantSubmitted(
  request: NextRequest,
  application: ApplicationRow,
  provider?: ProviderRow | null,
) {
  await notify(
    request,
    SLACK_EVENT_KEYS.TERMINAL_MERCHANT_APPLICATION_SUBMITTED,
    "Terminal merchant application submitted",
    [
      `Application: ${application.application_no}`,
      `Business: ${application.trading_name ?? application.legal_name ?? provider?.business_name ?? "—"}`,
      `Status: ${application.status}`,
    ],
    application,
    provider,
  );
}

export async function slackNotifyTerminalMerchantApproved(
  request: NextRequest,
  application: ApplicationRow,
  provider?: ProviderRow | null,
) {
  await notify(
    request,
    SLACK_EVENT_KEYS.TERMINAL_MERCHANT_APPLICATION_APPROVED,
    "Terminal merchant application approved",
    [
      `Application: ${application.application_no}`,
      `Business: ${application.trading_name ?? provider?.business_name ?? "—"}`,
    ],
    application,
    provider,
  );
}

export async function slackNotifyTerminalMerchantTermSheetAccepted(
  request: NextRequest,
  application: ApplicationRow,
  provider?: ProviderRow | null,
) {
  await notify(
    request,
    SLACK_EVENT_KEYS.TERMINAL_MERCHANT_APPLICATION_TERM_SHEET_ACCEPTED,
    "Terminal merchant term sheet accepted",
    [`Application: ${application.application_no}`],
    application,
    provider,
  );
}

export async function slackNotifyTerminalMerchantStalled(
  request: NextRequest,
  application: ApplicationRow,
  provider?: ProviderRow | null,
) {
  await notify(
    request,
    SLACK_EVENT_KEYS.TERMINAL_MERCHANT_APPLICATION_STALLED,
    "Terminal merchant application stalled",
    [
      `Application: ${application.application_no}`,
      `Status: ${application.status}`,
      "Unassigned or awaiting action >24h",
    ],
    application,
    provider,
  );
}
