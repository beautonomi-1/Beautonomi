import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAdminPayoutReadiness } from "@/lib/admin/validate-provider-payout-readiness";
import { resolveSupportTicketTenantId } from "@/lib/agents/support-ticket-tenant";

export type ExecuteApprovedAgentActionInput = {
  supabase: SupabaseClient;
  tenantId: string;
  actorUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  proposedPayload: Record<string, unknown>;
};

export type ExecuteApprovedAgentActionResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: string; retryable?: boolean };

/**
 * Deterministic side-effects for human-approved agent actions.
 * Only action types explicitly allowlisted here may mutate production state.
 */
export async function executeApprovedAgentAction(
  input: ExecuteApprovedAgentActionInput,
): Promise<ExecuteApprovedAgentActionResult> {
  const { supabase, tenantId, actorUserId, actionType, targetType, targetId, proposedPayload } =
    input;

  if (actionType === "payout.review" && targetType === "payout") {
    const recommendation = String(proposedPayload.recommendation ?? "");
    const rationale = String(proposedPayload.rationale ?? "Agent-approved payout review");
    const payoutId = String(proposedPayload.payoutId ?? targetId);

    const { data: payout } = await supabase
      .from("payouts")
      .select("id, status, provider_id, amount")
      .eq("id", payoutId)
      .maybeSingle();

    if (!payout) return { ok: false, reason: "payout_not_found" };
    if (payout.status !== "pending") {
      return { ok: false, reason: `payout_not_pending:${payout.status}` };
    }

    if (recommendation === "hold") {
      await supabase
        .from("payouts")
        .update({
          admin_notes: `[agent hold] ${rationale}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId)
        .eq("status", "pending");
      return { ok: true, result: { payoutId, action: "hold_noted" } };
    }

    if (recommendation === "reject") {
      const { data: rejected } = await supabase
        .from("payouts")
        .update({
          status: "failed",
          rejected_by: actorUserId,
          rejected_at: new Date().toISOString(),
          failure_reason: rationale,
          admin_notes: `[agent reject] ${rationale}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!rejected) return { ok: false, reason: "payout_reject_race", retryable: true };
      return { ok: true, result: { payoutId, action: "rejected" } };
    }

    if (recommendation === "approve") {
      if (payout.provider_id) {
        const readiness = await validateAdminPayoutReadiness({
          supabase,
          providerId: payout.provider_id,
          tenantId,
          requestedAccountId: null,
          requireAccount: true,
        });
        if (readiness.ok === false) {
          return { ok: false, reason: readiness.code, retryable: false };
        }
      }

      const { data: approved } = await supabase
        .from("payouts")
        .update({
          status: "processing",
          approved_by: actorUserId,
          approved_at: new Date().toISOString(),
          admin_notes: `[agent approve] ${rationale}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payoutId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!approved) return { ok: false, reason: "payout_approve_race", retryable: true };
      return { ok: true, result: { payoutId, action: "approved" } };
    }

    return { ok: false, reason: `unknown_payout_recommendation:${recommendation}` };
  }

  if (actionType === "reconciliation.investigate" && targetType === "reconciliation_exception") {
    const briefing = (proposedPayload.briefing ?? {}) as Record<string, unknown>;
    const summary = String(briefing.summary ?? proposedPayload.note ?? "Agent investigation briefing");
    const { data: row } = await supabase
      .from("reconciliation_exceptions")
      .select("metadata")
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!row) return { ok: false, reason: "exception_not_found" };

    const existingMeta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
    const { data: updated } = await supabase
      .from("reconciliation_exceptions")
      .update({
        metadata: { ...existingMeta, agent_briefing: summary, agent_briefing_at: new Date().toISOString() },
      })
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "exception_not_found" };
    return { ok: true, result: { exceptionId: targetId, action: "briefing_recorded" } };
  }

  if (actionType === "fraud.briefing" && targetType === "fraud_case") {
    const briefing = (proposedPayload.briefing ?? {}) as Record<string, unknown>;
    const summary = String(briefing.summary ?? "Agent fraud briefing");
    const recommendation = String(briefing.recommendation ?? "");
    const { data: row } = await supabase
      .from("fraud_cases")
      .select("signals")
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!row) return { ok: false, reason: "fraud_case_not_found" };

    const existingSignals = (row as { signals?: Record<string, unknown> }).signals ?? {};
    const { data: updated } = await supabase
      .from("fraud_cases")
      .update({
        signals: {
          ...existingSignals,
          agent_briefing: summary,
          agent_recommendation: recommendation || null,
          agent_briefing_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "fraud_case_not_found" };
    return { ok: true, result: { caseId: targetId, action: "briefing_recorded" } };
  }

  if (actionType === "support.reply" && targetType === "support_ticket") {
    const draft = String(proposedPayload.draftReply ?? "").trim();
    if (!draft) return { ok: false, reason: "empty_reply_draft" };
    const followUpKind = String(proposedPayload.followUpKind ?? "");
    const isCsatRecovery = followUpKind === "csat_recovery";

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, status, user_id, provider_id, requester_type, first_staff_reply_at")
      .eq("id", targetId)
      .maybeSingle();
    if (!ticket) return { ok: false, reason: "ticket_not_found" };
    const ticketTenantId = await resolveSupportTicketTenantId(supabase, ticket);
    if (ticketTenantId !== tenantId) return { ok: false, reason: "ticket_not_in_tenant" };
    // CSAT recovery is the one case where we intentionally reopen a closed loop
    // to send a recovery message. Every other reply refuses resolved/closed tickets.
    if (["resolved", "closed"].includes(String(ticket.status)) && !isCsatRecovery) {
      return { ok: false, reason: `ticket_status_${ticket.status}` };
    }

    const now = new Date().toISOString();
    const { data: message, error: msgError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: targetId,
        user_id: actorUserId,
        message: draft,
        is_internal: false,
      })
      .select("id, created_at")
      .maybeSingle();
    if (msgError || !message) return { ok: false, reason: "reply_insert_failed", retryable: true };

    const nextStatus = isCsatRecovery
      ? "in_progress"
      : String(ticket.status) === "open"
        ? "in_progress"
        : ticket.status;

    const ticketUpdate: Record<string, unknown> = {
      last_message_at: (message as { created_at?: string }).created_at ?? now,
      last_message_from: "staff",
      first_staff_reply_at: (ticket as { first_staff_reply_at?: string | null }).first_staff_reply_at ?? now,
      status: nextStatus,
      updated_at: now,
    };
    if (isCsatRecovery) {
      ticketUpdate.resolved_at = null;
      ticketUpdate.closed_at = null;
    }

    await supabase
      .from("support_tickets")
      .update(ticketUpdate)
      .eq("id", targetId);

    // Best-effort customer notification; the reply itself already landed.
    try {
      const { notifySupportTicketUpdated } = await import("@/lib/notifications/notification-service");
      await notifySupportTicketUpdated(
        String((ticket as { user_id?: string }).user_id ?? ""),
        String((ticket as { ticket_number?: string }).ticket_number ?? targetId),
        "Support has replied to your ticket",
        targetId,
        ["email", "push"],
        (ticket as { requester_type?: string }).requester_type === "provider" ? "provider" : "customer",
      );
    } catch (notifyErr) {
      console.error("[agent-execute] support.reply notify failed:", notifyErr);
    }

    return { ok: true, result: { ticketId: targetId, action: "reply_sent", messageId: (message as { id?: string }).id } };
  }

  if (actionType === "support.resolve" && targetType === "support_ticket") {
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, status, provider_id, last_message_from, last_message_at")
      .eq("id", targetId)
      .maybeSingle();
    if (!ticket) return { ok: false, reason: "ticket_not_found" };
    const ticketTenantId = await resolveSupportTicketTenantId(supabase, ticket);
    if (ticketTenantId !== tenantId) return { ok: false, reason: "ticket_not_in_tenant" };
    if (["resolved", "closed"].includes(String(ticket.status))) {
      return { ok: true, result: { ticketId: targetId, action: "already_resolved" } };
    }
    // Guard against racing the customer: if they replied after the proposal
    // was made, do not close on them.
    if (String(ticket.last_message_from) === "customer") {
      return { ok: false, reason: "customer_replied_since_proposal" };
    }

    const now = new Date().toISOString();
    const { data: updated } = await supabase
      .from("support_tickets")
      .update({ status: "resolved", resolved_at: now, updated_at: now })
      .eq("id", targetId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "resolve_update_failed", retryable: true };
    return { ok: true, result: { ticketId: targetId, action: "resolved" } };
  }

  if (actionType === "support.assign" && targetType === "support_ticket") {
    const assigneeUserId = String(proposedPayload.assigneeUserId ?? "").trim();
    if (!assigneeUserId) return { ok: false, reason: "missing_assignee" };

    const { data: assignee } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", assigneeUserId)
      .maybeSingle();
    const assigneeRole = (assignee as { role?: string } | null)?.role ?? "";
    if (!assignee || !["support_agent", "admin_support", "superadmin"].includes(assigneeRole)) {
      return { ok: false, reason: "assignee_not_support_staff" };
    }

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, status, provider_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!ticket) return { ok: false, reason: "ticket_not_found" };
    const ticketTenantId = await resolveSupportTicketTenantId(supabase, ticket);
    if (ticketTenantId !== tenantId) return { ok: false, reason: "ticket_not_in_tenant" };

    const { data: updated } = await supabase
      .from("support_tickets")
      .update({
        assigned_to: assigneeUserId,
        status: String(ticket.status) === "open" ? "in_progress" : ticket.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "assign_update_failed", retryable: true };

    try {
      const { notifySupportStaffInboxActivity } = await import("@/lib/notifications/notification-service");
      await notifySupportStaffInboxActivity(
        [assigneeUserId],
        targetId,
        "A ticket was assigned to you (agent triage, human-approved)",
        targetId,
        ["email", "push"],
      );
    } catch (notifyErr) {
      console.error("[agent-execute] support.assign notify failed:", notifyErr);
    }

    return { ok: true, result: { ticketId: targetId, action: "assigned", assigneeUserId } };
  }

  if (actionType === "dispute.briefing" && targetType === "booking_dispute") {
    const briefing = (proposedPayload.briefing ?? {}) as Record<string, unknown>;
    const summary = String(briefing.summary ?? "Agent dispute briefing");

    const { data: dispute } = await supabase
      .from("booking_disputes")
      .select("id, notes, booking_id, status")
      .eq("id", targetId)
      .maybeSingle();
    if (!dispute) return { ok: false, reason: "dispute_not_found" };

    const { data: booking } = await supabase
      .from("bookings")
      .select("tenant_id")
      .eq("id", (dispute as { booking_id?: string }).booking_id ?? "")
      .maybeSingle();
    if (((booking as { tenant_id?: string | null } | null)?.tenant_id ?? null) !== tenantId) {
      return { ok: false, reason: "dispute_not_in_tenant" };
    }

    const existingNotes = String((dispute as { notes?: string | null }).notes ?? "").trim();
    const stamped = `[Agent briefing ${new Date().toISOString().slice(0, 16)}] ${summary}`;
    const { data: updated } = await supabase
      .from("booking_disputes")
      .update({
        notes: existingNotes ? `${existingNotes}\n\n${stamped}` : stamped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "dispute_update_failed", retryable: true };
    return { ok: true, result: { disputeId: targetId, action: "briefing_recorded" } };
  }

  if (actionType === "refund.briefing" && targetType === "booking_refund") {
    const briefing = (proposedPayload.briefing ?? {}) as Record<string, unknown>;
    const summary = String(briefing.summary ?? "Agent refund briefing");

    const { data: refund } = await supabase
      .from("booking_refunds")
      .select("id, booking_id, notes")
      .eq("id", targetId)
      .maybeSingle();
    if (!refund) return { ok: false, reason: "refund_not_found" };
    const { data: booking } = await supabase
      .from("bookings")
      .select("tenant_id")
      .eq("id", (refund as { booking_id?: string }).booking_id ?? "")
      .maybeSingle();
    if (((booking as { tenant_id?: string | null } | null)?.tenant_id ?? null) !== tenantId) {
      return { ok: false, reason: "refund_not_in_tenant" };
    }

    const existingNotes = String((refund as { notes?: string | null }).notes ?? "").trim();
    const stamped = `[Agent briefing ${new Date().toISOString().slice(0, 16)}] ${summary}`;
    const { data: updated } = await supabase
      .from("booking_refunds")
      .update({
        notes: existingNotes ? `${existingNotes}\n\n${stamped}` : stamped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "refund_update_failed", retryable: true };
    return { ok: true, result: { refundId: targetId, action: "briefing_recorded" } };
  }

  if (actionType === "report.briefing" && targetType === "user_report") {
    const briefing = (proposedPayload.briefing ?? {}) as Record<string, unknown>;
    const summary = String(briefing.summary ?? "Agent report briefing");

    const { data: report } = await supabase
      .from("user_reports")
      .select("id, resolution_notes, tenant_id, status")
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!report) return { ok: false, reason: "report_not_found" };

    const existingNotes = String((report as { resolution_notes?: string | null }).resolution_notes ?? "").trim();
    const stamped = `[Agent briefing ${new Date().toISOString().slice(0, 16)}] ${summary}`;
    const { data: updated } = await supabase
      .from("user_reports")
      .update({
        resolution_notes: existingNotes ? `${existingNotes}\n\n${stamped}` : stamped,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetId)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (!updated) return { ok: false, reason: "report_update_failed", retryable: true };
    return { ok: true, result: { reportId: targetId, action: "briefing_recorded" } };
  }

  if ((actionType === "provider.outreach" && targetType === "provider") ||
      (actionType === "catalog.review" && targetType === "offering")) {
    const providerId = String(proposedPayload.providerId ?? (targetType === "provider" ? targetId : ""));
    const message = String(proposedPayload.message ?? "").trim();
    const subject = String(proposedPayload.subject ?? "A note from Beautonomi").trim();
    if (!message) return { ok: false, reason: "empty_outreach_message" };

    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id, user_id, business_name")
      .eq("id", providerId)
      .maybeSingle();
    if (!provider) return { ok: false, reason: "provider_not_found" };
    if (String((provider as { tenant_id?: string }).tenant_id) !== tenantId) {
      return { ok: false, reason: "provider_not_in_tenant" };
    }

    const { dispatchTemplateNotification } = await import(
      "@/lib/notifications/dispatch-template-notification"
    );
    const send = await dispatchTemplateNotification(
      "agent_provider_outreach",
      [String((provider as { user_id?: string }).user_id ?? "")],
      { subject, message, tenant_id: tenantId },
      ["push", "email"],
      { appType: "provider" },
    );
    if (!send.success) {
      return { ok: false, reason: `outreach_send_failed:${send.error ?? "unknown"}`, retryable: true };
    }
    return {
      ok: true,
      result: { providerId, action: actionType === "catalog.review" ? "catalog_tips_sent" : "outreach_sent" },
    };
  }

  if (actionType === "provider.digest" && targetType === "provider") {
    const stats = (proposedPayload.stats ?? {}) as Record<string, unknown>;
    const suggestion = String(proposedPayload.suggestion ?? "");
    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id, user_id, business_name")
      .eq("id", targetId)
      .maybeSingle();
    if (!provider) return { ok: false, reason: "provider_not_found" };
    if (String((provider as { tenant_id?: string }).tenant_id) !== tenantId) {
      return { ok: false, reason: "provider_not_in_tenant" };
    }

    const { dispatchTemplateNotification } = await import(
      "@/lib/notifications/dispatch-template-notification"
    );
    const send = await dispatchTemplateNotification(
      "agent_provider_digest",
      [String((provider as { user_id?: string }).user_id ?? "")],
      {
        week: String(proposedPayload.week ?? ""),
        bookings: String(stats.bookings ?? 0),
        completed: String(stats.completed ?? 0),
        cancelled: String(stats.cancelled ?? 0),
        revenue: `${stats.currency ?? "ZAR"} ${Number(stats.revenue ?? 0).toFixed(2)}`,
        new_reviews: String(stats.newReviews ?? 0),
        suggestion,
        tenant_id: tenantId,
      },
      ["push", "email"],
      { appType: "provider" },
    );
    if (!send.success) {
      return { ok: false, reason: `digest_send_failed:${send.error ?? "unknown"}`, retryable: true };
    }
    return { ok: true, result: { providerId: targetId, action: "digest_sent" } };
  }

  if (actionType === "membership.dunning" && targetType === "user_membership") {
    const { data: membership } = await supabase
      .from("user_memberships")
      .select("id, user_id, status, provider:providers!inner(tenant_id, business_name)")
      .eq("id", targetId)
      .maybeSingle();
    if (!membership) return { ok: false, reason: "membership_not_found" };
    const provider = membership.provider as unknown as { tenant_id?: string; business_name?: string } | null;
    if (String(provider?.tenant_id) !== tenantId) return { ok: false, reason: "membership_not_in_tenant" };
    if (String(membership.status) !== "past_due") {
      return { ok: true, result: { membershipId: targetId, action: "skipped_no_longer_past_due" } };
    }

    const { notifyMembershipPaymentFailed } = await import("@/lib/notifications/notification-service");
    const send = await notifyMembershipPaymentFailed(
      String(membership.user_id),
      String(proposedPayload.membershipName ?? "your membership"),
      String(proposedPayload.providerName ?? provider?.business_name ?? "your provider"),
      ["email", "push"],
    );
    if (!(send as { success?: boolean }).success) {
      return { ok: false, reason: "dunning_send_failed", retryable: true };
    }
    return { ok: true, result: { membershipId: targetId, action: "dunning_sent" } };
  }

  if (actionType === "trust.open_case" && targetType === "provider") {
    const signals = (proposedPayload.signals ?? {}) as Record<string, unknown>;
    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("id", targetId)
      .maybeSingle();
    if (!provider) return { ok: false, reason: "provider_not_found" };
    if (String((provider as { tenant_id?: string }).tenant_id) !== tenantId) {
      return { ok: false, reason: "provider_not_in_tenant" };
    }

    const { openFraudCase } = await import("@/lib/fraud/open-fraud-case");
    const monthKey = new Date().toISOString().slice(0, 7);
    const result = await openFraudCase({
      tenantId,
      subjectProviderId: targetId,
      riskScore: Number(proposedPayload.riskScore ?? 50),
      signal: String(signals.kind ?? "review_fraud_pattern"),
      signals: {
        ...signals,
        agent_briefing: {
          summary: String(proposedPayload.summary ?? ""),
          opened_by_agent: true,
          approved_by: actorUserId,
          opened_at: new Date().toISOString(),
        },
      },
      idempotencyKey: `agent-open-case:${targetId}:${monthKey}`,
      skipSlack: false,
    });

    return {
      ok: true,
      result: {
        action: result.alreadyExisted ? "case_already_open" : "fraud_case_opened",
        fraudCaseId: result.fraudCaseId,
      },
    };
  }

  return { ok: false, reason: `unsupported_action_type:${actionType}` };
}
