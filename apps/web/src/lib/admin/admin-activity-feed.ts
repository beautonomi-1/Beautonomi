/** Activity types that represent actionable admin queues (count toward bell badge). */
export const ACTIONABLE_ACTIVITY_TYPES = new Set([
  "payout_request",
  "verification",
  "provider_approval",
  "webhook_failure",
  "payment_failure",
  "refundable_payment",
  "dispute",
  "provider_violation",
  "user_report",
  "ops_new_lead",
  "ops_stalled_onboarding",
  "safety_event",
]);

export type AdminActivityItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  link: string;
  priority: string;
};

/** Bell badge: sum actionable queue depths (each bucket already fetch-capped; safety uses feed rows only). */
export function computeActivityTotalUnreadFromCounts(counts: {
  pending_payouts?: number;
  pending_verifications?: number;
  pending_provider_approvals?: number;
  webhook_failures?: number;
  payment_failures?: number;
  refundable_payments?: number;
  disputes?: number;
  provider_violations?: number;
  pending_user_reports?: number;
  ops_new_leads?: number;
  ops_stalled?: number;
  safety_in_feed?: number;
}): number {
  return (
    (counts.pending_payouts ?? 0) +
    (counts.pending_verifications ?? 0) +
    (counts.pending_provider_approvals ?? 0) +
    (counts.webhook_failures ?? 0) +
    (counts.payment_failures ?? 0) +
    (counts.refundable_payments ?? 0) +
    (counts.disputes ?? 0) +
    (counts.provider_violations ?? 0) +
    (counts.pending_user_reports ?? 0) +
    (counts.ops_new_leads ?? 0) +
    (counts.ops_stalled ?? 0) +
    (counts.safety_in_feed ?? 0)
  );
}

/** @deprecated Prefer computeActivityTotalUnreadFromCounts for badge totals. */
export function computeActivityTotalUnread(activities: AdminActivityItem[]): number {
  return activities.filter((a) => ACTIONABLE_ACTIVITY_TYPES.has(a.type)).length;
}

export const ADMIN_ACTIVITY_LINKS = {
  payoutsPending: "/admin/payouts?status=pending",
  verificationsPending: "/admin/identity-trust/sessions?status=pending_review#verification",
  manualVerificationsPending: "/admin/verifications?status=pending#verification",
  providersPendingApproval: "/admin/providers?status=pending_approval",
  providersSuspended: "/admin/providers?status=suspended",
  bookingDetail: (id: string) => `/admin/bookings/${id}`,
  webhooksFailures: "/admin/webhooks?tab=failures",
  financePayments: "/admin/finance?type=payment",
  refundsSuccess: "/admin/refunds?status=success",
  disputesOpen: "/admin/disputes?status=open",
  opsLeadsNew: "/admin/provider-ops/leads?stage=new",
  opsTrackerStalled: "/admin/provider-ops/tracker?status=stalled",
  userReportsPending: "/admin/user-reports?status=pending",
  safetyLogs: "/admin/control-plane/safety-logs",
  users: "/admin/users",
  providers: "/admin/providers",
} as const;
