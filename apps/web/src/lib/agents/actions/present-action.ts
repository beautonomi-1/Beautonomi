/**
 * Human-readable presentation layer for agent actions.
 * Single source of copy for cards, queues, notifications, and the console.
 */

export type AgentActionImpact = "customer_visible" | "mutation" | "internal_note";

export type PresentedAgentAction = {
  title: string;
  consequenceLine: string;
  impact: AgentActionImpact;
  impactLabel: string;
  primaryButtonLabel: string;
  editableField?: "draftReply" | "messageBody" | "recommendation";
  entityPath: (targetId: string) => string;
};

const PRESENTATION: Record<string, PresentedAgentAction> = {
  "support.reply": {
    title: "Suggested reply",
    consequenceLine: "Posts a public reply to the customer and marks first response when applicable.",
    impact: "customer_visible",
    impactLabel: "Customer-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "draftReply",
    entityPath: (id) => `/admin/support-tickets/${id}`,
  },
  "support.assign": {
    title: "Suggested assignment",
    consequenceLine: "Assigns this ticket to the recommended support agent.",
    impact: "mutation",
    impactLabel: "Changes ticket",
    primaryButtonLabel: "Approve assignment",
    entityPath: (id) => `/admin/support-tickets/${id}`,
  },
  "support.resolve": {
    title: "Suggested resolution",
    consequenceLine: "Marks this ticket as resolved.",
    impact: "mutation",
    impactLabel: "Changes ticket",
    primaryButtonLabel: "Approve and resolve",
    entityPath: (id) => `/admin/support-tickets/${id}`,
  },
  "payout.review": {
    title: "Payout recommendation",
    consequenceLine:
      "Applies the recommended payout decision (approve, hold, or reject). Requires two distinct finance approvals before it runs.",
    impact: "mutation",
    impactLabel: "Changes money",
    primaryButtonLabel: "Approve recommendation",
    editableField: "recommendation",
    entityPath: (id) => `/admin/payouts?highlight=${id}`,
  },
  "reconciliation.investigate": {
    title: "Investigation briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/reconciliation-exceptions?highlight=${id}`,
  },
  "refund.briefing": {
    title: "Refund briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/refunds?highlight=${id}`,
  },
  "fraud.briefing": {
    title: "Fraud case briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/fraud-cases?highlight=${id}`,
  },
  "dispute.briefing": {
    title: "Dispute briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/disputes?highlight=${id}`,
  },
  "report.briefing": {
    title: "Report briefing",
    consequenceLine: "Adds an internal briefing note. Nothing is sent externally.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/user-reports?highlight=${id}`,
  },
  "moderation.briefing": {
    title: "Moderation briefing",
    consequenceLine: "Escalates the report status. Does not hide content.",
    impact: "internal_note",
    impactLabel: "Internal note only",
    primaryButtonLabel: "Add briefing",
    entityPath: (id) => `/admin/content-reports?highlight=${id}`,
  },
  "moderation.hide": {
    title: "Hide reported content",
    consequenceLine: "Hides the reported content from public view. Reversible by a trust admin.",
    impact: "mutation",
    impactLabel: "Public takedown",
    primaryButtonLabel: "Approve takedown",
    entityPath: (id) => `/admin/content-reports?highlight=${id}`,
  },
  "trust.open_case": {
    title: "Open fraud case",
    consequenceLine: "Creates a fraud case for human investigation.",
    impact: "mutation",
    impactLabel: "Creates case",
    primaryButtonLabel: "Approve",
    entityPath: (id) => `/admin/fraud-cases?highlight=${id}`,
  },
  "provider.outreach": {
    title: "Provider outreach message",
    consequenceLine: "Sends a push notification and email to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
    entityPath: (id) => `/admin/providers/${id}`,
  },
  "provider.digest": {
    title: "Provider digest",
    consequenceLine: "Sends a weekly digest push and email to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
    entityPath: (id) => `/admin/providers/${id}`,
  },
  "catalog.review": {
    title: "Catalog listing review",
    consequenceLine: "Sends listing feedback to the provider.",
    impact: "customer_visible",
    impactLabel: "Provider-visible",
    primaryButtonLabel: "Approve and send",
    entityPath: (id) => `/admin/providers/${id}`,
  },
  "membership.dunning": {
    title: "Membership payment reminder",
    consequenceLine: "Sends a payment reminder to the member.",
    impact: "customer_visible",
    impactLabel: "Customer-visible",
    primaryButtonLabel: "Approve and send",
    editableField: "messageBody",
    entityPath: () => `/admin/finance/ai-queue`,
  },
};

export function presentAgentAction(actionType: string): PresentedAgentAction {
  return (
    PRESENTATION[actionType] ?? {
      title: actionType.replace(/\./g, " ").replace(/_/g, " "),
      consequenceLine: "Applies the proposed action after approval.",
      impact: "mutation" as const,
      impactLabel: "Requires review",
      primaryButtonLabel: "Approve",
      entityPath: (id) => `/admin/control-plane/modules/agents?action=${id}`,
    }
  );
}

export function agentActionDeepLink(
  actionType: string,
  targetType: string,
  targetId: string,
  actionId: string,
): string {
  const presented = presentAgentAction(actionType);
  const base = presented.entityPath(targetId);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}assist=${encodeURIComponent(actionId)}`;
}

export type HumanStatusLabel = {
  label: string;
  badgeClass: string;
};

export function humanAgentActionStatus(
  status: string,
  opts?: { shadowMode?: boolean; executionBlocked?: boolean },
): HumanStatusLabel {
  if (status === "proposed") {
    return { label: "Awaiting your review", badgeClass: "bg-amber-100 text-amber-800" };
  }
  if (status === "approval_pending") {
    return { label: "Awaiting additional approval", badgeClass: "bg-amber-100 text-amber-800" };
  }
  if (status === "approved") {
    if (opts?.shadowMode || opts?.executionBlocked) {
      return { label: "Approved, sending paused", badgeClass: "bg-blue-100 text-blue-800" };
    }
    return { label: "Ready to send", badgeClass: "bg-blue-100 text-blue-800" };
  }
  if (status === "executed") {
    return { label: "Applied", badgeClass: "bg-green-100 text-green-800" };
  }
  if (status === "rejected") {
    return { label: "Rejected", badgeClass: "bg-gray-100 text-gray-600" };
  }
  if (status === "expired") {
    return { label: "Expired before review", badgeClass: "bg-gray-100 text-gray-600" };
  }
  if (status === "superseded") {
    return { label: "Replaced by newer draft", badgeClass: "bg-gray-100 text-gray-600" };
  }
  if (status === "retryable_failure" || status === "permanent_failure") {
    return { label: "Send failed", badgeClass: "bg-red-100 text-red-800" };
  }
  return { label: status, badgeClass: "bg-gray-100 text-gray-600" };
}
