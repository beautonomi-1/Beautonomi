/** Client-side mirror of apps/web present-action.ts — keep labels in sync. */

export type AgentActionImpact = "customer_visible" | "mutation" | "internal_note";

export type AgentAssistPresentation = {
  title: string;
  consequenceLine: string;
  impact: AgentActionImpact;
  impactLabel: string;
  primaryButtonLabel: string;
  editableField?: "draftReply" | "messageBody" | "recommendation";
};

const COPY: Record<string, AgentAssistPresentation> = {
  "support.reply": {
    title: "Suggested reply",
    consequenceLine: "Posts a public reply to the customer and marks first response when applicable.",
    impact: "customer_visible",
    impactLabel: "Customer-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "draftReply",
  },
  "support.assign": {
    title: "Suggested assignment",
    consequenceLine: "Assigns this ticket to the recommended support agent.",
    impact: "mutation",
    impactLabel: "Changes ticket",
    primaryButtonLabel: "Approve assignment",
  },
  "support.resolve": {
    title: "Suggested resolution",
    consequenceLine: "Marks this ticket as resolved.",
    impact: "mutation",
    impactLabel: "Changes ticket",
    primaryButtonLabel: "Approve and resolve",
  },
  "payout.review": {
    title: "Payout recommendation",
    consequenceLine:
      "Applies the recommended payout decision (approve, hold, or reject). Requires two distinct finance approvals before it runs.",
    impact: "mutation",
    impactLabel: "Changes money",
    primaryButtonLabel: "Approve recommendation",
    editableField: "recommendation",
  },
  "reconciliation.investigate": {
    title: "Investigation briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "refund.briefing": {
    title: "Refund briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "fraud.briefing": {
    title: "Fraud case briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "dispute.briefing": {
    title: "Dispute briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "report.briefing": {
    title: "Report briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "moderation.briefing": {
    title: "Moderation briefing",
    consequenceLine: "Escalates the report status. Does not hide content.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
  },
  "moderation.hide": {
    title: "Hide reported content",
    consequenceLine: "Hides the reported content from public view. Reversible by a trust admin.",
    impact: "mutation",
    impactLabel: "Public takedown",
    primaryButtonLabel: "Approve takedown",
  },
  "trust.open_case": {
    title: "Open fraud case",
    consequenceLine: "Creates a fraud case for human investigation.",
    impact: "mutation",
    impactLabel: "Creates case",
    primaryButtonLabel: "Approve",
  },
  "provider.outreach": {
    title: "Provider outreach message",
    consequenceLine: "Sends a push notification and email to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
  },
  "provider.digest": {
    title: "Provider digest",
    consequenceLine: "Sends a weekly digest push and email to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
  },
  "catalog.review": {
    title: "Catalog listing review",
    consequenceLine: "Sends listing feedback to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
  },
  "membership.dunning": {
    title: "Membership payment reminder",
    consequenceLine: "Sends a payment reminder to the member.",
    impact: "customer_visible",
    impactLabel: "Customer-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
  },
};

/** Entity routes for queue → detail/list deeplinks (keep in sync with apps/web present-action.ts). */
const ENTITY_PATH: Record<string, (targetId: string) => string> = {
  "support.reply": (id) => `/admin/support-tickets/${id}`,
  "support.assign": (id) => `/admin/support-tickets/${id}`,
  "support.resolve": (id) => `/admin/support-tickets/${id}`,
  "payout.review": (id) => `/admin/payouts?highlight=${id}`,
  "reconciliation.investigate": (id) => `/admin/reconciliation-exceptions?highlight=${id}`,
  "refund.briefing": (id) => `/admin/refunds?highlight=${id}`,
  "fraud.briefing": (id) => `/admin/fraud-cases?highlight=${id}`,
  "dispute.briefing": (id) => `/admin/disputes?highlight=${id}`,
  "report.briefing": (id) => `/admin/user-reports?highlight=${id}`,
  "moderation.briefing": (id) => `/admin/content-reports?highlight=${id}`,
  "moderation.hide": (id) => `/admin/content-reports?highlight=${id}`,
  "trust.open_case": (id) => `/admin/fraud-cases?highlight=${id}`,
  "provider.outreach": (id) => `/admin/providers/${id}`,
  "provider.digest": (id) => `/admin/providers/${id}`,
  "catalog.review": (id) => `/admin/providers/${id}`,
  "membership.dunning": () => `/admin/finance/ai-queue`,
};

/** Build SPA path to review a proposed action (list pages need ?highlight=; detail pages use route id). */
export function agentActionDeepLink(actionType: string, targetId: string, actionId: string): string {
  const base = (ENTITY_PATH[actionType] ?? (() => `/admin/control-plane/modules/agents?action=${actionId}`))(
    targetId,
  );
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}assist=${encodeURIComponent(actionId)}`;
}

export function getAgentAssistPresentation(actionType: string): AgentAssistPresentation {
  return (
    COPY[actionType] ?? {
      title: actionType.replace(/\./g, " ").replace(/_/g, " "),
      consequenceLine: "Applies the proposed action after approval.",
      impact: "mutation",
      impactLabel: "Requires review",
      primaryButtonLabel: "Approve",
    }
  );
}

const IMPACT_BADGE: Record<AgentActionImpact, string> = {
  customer_visible: "bg-violet-100 text-violet-800",
  mutation: "bg-amber-100 text-amber-800",
  internal_note: "bg-slate-100 text-slate-700",
};

export function impactBadgeClass(impact: AgentActionImpact): string {
  return IMPACT_BADGE[impact];
}

export function humanStatusLabel(status: string, shadowMode?: boolean): { label: string; className: string } {
  if (status === "proposed") {
    return { label: "Awaiting your review", className: "bg-amber-100 text-amber-800" };
  }
  if (status === "approval_pending") {
    return { label: "Awaiting additional approval", className: "bg-amber-100 text-amber-800" };
  }
  if (status === "approved") {
    if (shadowMode) {
      return { label: "Approved, sending paused", className: "bg-blue-100 text-blue-800" };
    }
    return { label: "Ready to send", className: "bg-blue-100 text-blue-800" };
  }
  if (status === "executed") return { label: "Applied", className: "bg-green-100 text-green-800" };
  if (status === "rejected") return { label: "Rejected", className: "bg-gray-100 text-gray-600" };
  if (status === "expired") return { label: "Expired before review", className: "bg-gray-100 text-gray-600" };
  if (status === "superseded") return { label: "Replaced by newer draft", className: "bg-gray-100 text-gray-600" };
  if (status === "retryable_failure" || status === "permanent_failure") {
    return { label: "Send failed", className: "bg-red-100 text-red-800" };
  }
  return { label: status, className: "bg-gray-100 text-gray-600" };
}
