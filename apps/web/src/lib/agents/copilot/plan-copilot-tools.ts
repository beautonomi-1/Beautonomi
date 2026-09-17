import type { CopilotIntent } from "./resolve-copilot-intent";
import type { CopilotEntityType, CopilotResolvedEntities } from "./copilot-types";
import { canonicalizeProviderId } from "./canonicalize-entity";

export type PlannedToolCall = { name: string; input: Record<string, unknown> };

const MAX_PROVIDER_CHAIN = 3;

export async function planToolsForIntent(params: {
  intent: CopilotIntent;
  question: string;
  environment: string;
  allowedSections: string[];
  tenantId: string;
  resolvedEntities: CopilotResolvedEntities;
}): Promise<PlannedToolCall[]> {
  const { intent, environment, allowedSections, tenantId, resolvedEntities } = params;
  const calls: PlannedToolCall[] = [];
  const has = (s: string) => allowedSections.includes(s);

  const providerId = await resolveProviderUuid(tenantId, resolvedEntities);
  const userId = resolvedEntities.user?.entityId;
  const bookingId = resolvedEntities.booking?.entityId;
  const ticketId = resolvedEntities.ticket?.entityId;

  const push = (name: string, input: Record<string, unknown>) => {
    if (calls.length >= 8) return;
    calls.push({ name, input });
  };

  switch (intent) {
    case "ops.health":
      if (has("operations")) push("ops.readSystemHealth", { environment });
      break;

    case "ticket.summary":
      if (ticketId && has("support")) push("support.readTicket", { ticketId });
      break;

    case "booking.status":
      if (bookingId && has("providers_operations")) push("booking.readSummary", { bookingId });
      break;

    case "provider.health":
      if (providerId && has("providers_operations")) {
        push("provider.readHealthSnapshot", { providerId });
        if (calls.length < MAX_PROVIDER_CHAIN) push("provider.readProfileSummary", { providerId });
      }
      break;

    case "provider.profile":
      if (providerId && has("providers_operations")) push("provider.readProfileSummary", { providerId });
      break;

    case "provider.earnings":
    case "provider.risk":
      if (providerId) {
        if (has("providers_operations") && intent === "provider.risk") {
          push("provider.readProfileSummary", { providerId });
        }
        if (has("finance")) push("finance.readProviderSummary", { providerId });
        else if (intent === "provider.earnings" && has("providers_operations")) {
          push("provider.readProfileSummary", { providerId });
        }
        if (intent === "provider.risk" && has("users_trust") && providerId) {
          push("trust.readProviderRiskSummary", { providerId });
        }
      }
      break;

    case "provider.onboarding":
      if (providerId && has("provider_ops")) push("provider.readOnboardingProgress", { providerId });
      else if (providerId && has("providers_operations")) push("provider.readProfileSummary", { providerId });
      break;

    case "provider.tickets":
      if (providerId && has("support")) push("support.listOpenTicketsForProvider", { providerId });
      break;

    case "user.profile":
    case "user.spend":
    case "user.bookings":
    case "user.tickets":
    case "user.risk":
      if (userId && has("users_trust")) {
        push("user.readProfileSummary", { userId });
        if (intent === "user.bookings") push("user.readRecentBookings", { userId });
        if (intent === "user.risk") push("trust.readUserRiskSummary", { userId });
      }
      break;

    case "report.deeplink":
      if (providerId && has("finance")) push("finance.readProviderSummary", { providerId });
      else if (providerId && has("providers_operations")) push("provider.readHealthSnapshot", { providerId });
      break;

    case "unknown":
    default:
      if (providerId && has("providers_operations")) {
        push("provider.readHealthSnapshot", { providerId });
        push("provider.readProfileSummary", { providerId });
      } else if (userId && has("users_trust")) {
        push("user.readProfileSummary", { userId });
      } else if (bookingId && has("providers_operations")) {
        push("booking.readSummary", { bookingId });
      }
      break;
  }

  // Legacy UUID-in-question for payout/refund/fraud/content when explicitly mentioned
  const q = params.question.toLowerCase();
  const payoutId = resolvedEntities.payout?.entityId;
  const refundId = resolvedEntities.refund?.entityId;
  const fraudId = resolvedEntities.fraud_case?.entityId;
  const reportId = resolvedEntities.content_report?.entityId;
  if (payoutId && q.includes("payout") && has("finance")) push("finance.readPayout", { payoutId });
  if (refundId && q.includes("refund") && has("finance")) push("finance.readRefund", { refundId });
  if (fraudId && q.includes("fraud") && has("users_trust")) push("trust.readFraudCase", { caseId: fraudId });
  if (reportId && q.includes("report") && has("users_trust")) {
    push("safety.readContentReport", { reportId });
  }

  return calls.slice(0, 8);
}

async function resolveProviderUuid(
  tenantId: string,
  resolved: CopilotResolvedEntities,
): Promise<string | undefined> {
  const raw = resolved.provider?.entityId;
  if (!raw) return undefined;
  const c = await canonicalizeProviderId(tenantId, raw);
  return c?.id ?? (raw.match(/^[0-9a-f-]{36}$/i) ? raw : undefined);
}

export function appendReportDeepLinks(intent: CopilotIntent, resolved: CopilotResolvedEntities): string {
  if (intent !== "report.deeplink") return "";
  const lines: string[] = ["\n\nOpen in admin:"];
  if (resolved.provider?.entityId) {
    lines.push(`- Provider Finance tab: /admin/providers/${resolved.provider.entityId}?tab=finance`);
    lines.push(`- Finance overview: /admin/finance?provider_id=${resolved.provider.entityId}`);
  }
  lines.push("- Reports hub: /admin/reports");
  lines.push("- Analytics: /admin/analytics");
  lines.push("- Gods Eye: /admin/gods-eye");
  return lines.join("\n");
}

export function entityTypeLabel(t: CopilotEntityType): string {
  switch (t) {
    case "support_ticket":
      return "ticket";
    default:
      return t;
  }
}
