import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";
import { fetchMergedFinanceLedgerSliceForTenant } from "@/lib/admin/finance-ledger-tenant";
import {
  fetchOpenSafetyEventsGlobal,
  fetchOpenSafetyEventsForTenant,
} from "@/lib/admin/safety-events-tenant-scope";
import { USER_VERIFICATION_QUEUE_STATUSES } from "@/lib/admin/verification-queue-statuses";
import {
  ADMIN_ACTIVITY_LINKS,
  computeActivityTotalUnreadFromCounts,
} from "@/lib/admin/admin-activity-feed";
import { fetchRefundableSuccessPaymentTxsForTenant } from "@/lib/admin/refundable-payment-transactions";

/**
 * GET /api/admin/activity
 * Get recent activity notifications for admin dashboard (header bell).
 * Any admin role can load; uses service client + tenant scoping (same as nav-counts).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const isSuperadmin = String(user?.role ?? '').toLowerCase() === 'superadmin';
    const supabase = getSupabaseAdmin();

    const tenantId = await resolveAdminApiTenantId(request);
    const tenantProviderIds = isSuperadmin ? await fetchAllProviderIdsForTenant(supabase, tenantId) : [];
    const safetyGlobalView = isSuperadmin && new URL(request.url).searchParams.get("scope") === "global";

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all activity types in parallel
    const [
      pendingPayouts,
      pendingVerifications,
      pendingDiditSessions,
      newProviders,
      recentBookings,
      pendingProviderApprovals,
      webhookFailures,
      failedPayments,
      refundablePayments,
      highValueTransactions,
      providerViolations,
      accountIssues,
      disputes,
      opsNewLeads,
      opsStalledOnboarding,
      pendingUserReports,
    ] = await Promise.allSettled([
      // Pending payouts
      supabase
        .from('payouts')
        .select('id, provider_id, amount, currency, status, scheduled_at, created_at, providers!inner(tenant_id)')
        .eq('providers.tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Pending verifications
      supabase
        .from('user_verifications')
        .select('id, user_id, document_type, status, submitted_at, created_at')
        .eq('tenant_id', tenantId)
        .in('status', [...USER_VERIFICATION_QUEUE_STATUSES])
        .order('submitted_at', { ascending: false })
        .limit(10),

      // Didit verification sessions awaiting review (superadmin ops console)
      isSuperadmin
        ? supabase
            .from("identity_verification_sessions")
            .select(
              "id, user_id, persona_type, status, updated_at, created_at, users:user_id ( full_name, email )",
            )
            .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
            .eq("status", "pending_review")
            .order("updated_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      
      // New providers (last 7 days)
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Recent bookings (last 24 hours)
      supabase
        .from('bookings')
        .select('id, customer_id, provider_id, booking_number, status, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Pending provider approvals
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Webhook failures (last 24 hours) — webhook_events has no tenant_id (platform-global)
      supabase
        .from('webhook_events')
        .select('id, source, event_type, status, error_message, created_at')
        .eq('status', 'failed')
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      (async () => {
        try {
          const rows = await fetchMergedFinanceLedgerSliceForTenant(
            supabase,
            tenantId,
            { start: last24Hours.toISOString(), end: null },
            { statusIn: ['failed', 'declined', 'error'] },
            10,
          );
          return { data: rows, error: null };
        } catch (e) {
          console.error('activity failed-payments ledger merge:', e);
          return { data: [], error: e };
        }
      })(),

      (async () => {
        try {
          const rows = await fetchRefundableSuccessPaymentTxsForTenant(supabase, tenantId, 10);
          return { data: rows, error: null };
        } catch (e) {
          console.error('activity refundable payments:', e);
          return { data: [], error: e };
        }
      })(),

      (async () => {
        try {
          const rows = await fetchMergedFinanceLedgerSliceForTenant(
            supabase,
            tenantId,
            { start: last24Hours.toISOString(), end: null },
            { transactionType: 'payment', amountGte: 500 },
            5,
            'amount',
            true,
          );
          return { data: rows, error: null };
        } catch (e) {
          console.error('activity high-value ledger merge:', e);
          return { data: [], error: e };
        }
      })(),
      
      // Provider suspensions (provider_status enum: draft | pending_approval | active | suspended)
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'suspended')
        .gte('updated_at', last7Days.toISOString())
        .order('updated_at', { ascending: false })
        .limit(10),

      // Account issues — tenant-scoped deactivated users (last 7 days)
      (async () => {
        try {
          const { data: scopedUsers, error } = await supabase.rpc('admin_users_in_tenant_scope', {
            p_tenant_id: tenantId,
            p_role: null,
          });
          if (error) return { data: [], error };
          type ScopedUser = {
            id: string;
            full_name?: string;
            email?: string;
            role?: string;
            deactivated_at?: string | null;
            created_at?: string;
          };
          const filtered = ((scopedUsers || []) as ScopedUser[])
            .filter(
              (u) =>
                u.deactivated_at &&
                new Date(u.deactivated_at).getTime() >= last7Days.getTime(),
            )
            .sort(
              (a, b) =>
                new Date(b.deactivated_at ?? 0).getTime() -
                new Date(a.deactivated_at ?? 0).getTime(),
            )
            .slice(0, 10);
          return { data: filtered, error: null };
        } catch (e) {
          console.error('activity account issues tenant scope:', e);
          return { data: [], error: e };
        }
      })(),
      
      // Booking disputes (open disputes)
      supabase
        .from('booking_disputes')
        .select('id, booking_id, reason, status, opened_by, created_at, bookings!inner(tenant_id)')
        .eq('bookings.tenant_id', tenantId)
        .eq('status', 'open')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),

      // Provider Ops: new leads (same definition as nav-counts)
      (async () => {
        try {
          const { data, error } = await supabase
            .from('provider_leads')
            .select('id, name, source, commercial_stage, created_at')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .eq('commercial_stage', 'new')
            .order('created_at', { ascending: false })
            .limit(5);
          return { data: data ?? [], error };
        } catch { return { data: [], error: null }; }
      })(),

      // Provider Ops: stalled onboarding (wizard_status column)
      (async () => {
        try {
          const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from('provider_onboarding_tracking')
            .select('id, user_id, wizard_status, current_step, last_progress_at')
            .eq('tenant_id', tenantId)
            .in('wizard_status', ['in_progress', 'stalled'])
            .lt('last_progress_at', cutoff)
            .order('last_progress_at', { ascending: true })
            .limit(5);
          return { data: data ?? [], error };
        } catch { return { data: [], error: null }; }
      })(),

      // Pending user reports (last 7 days)
      supabase
        .from('user_reports')
        .select('id, reporter_id, reported_user_id, report_type, status, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    type ActivityItem = { id: string; type: string; title: string; message: string; timestamp: string; link: string; priority: string };
    type PayoutRow = { id: string; provider_id?: string; amount: number; currency?: string; created_at?: string };
    type ProviderRow = { id: string; business_name?: string; status?: string; created_at?: string; updated_at?: string };
    type VerificationRow = { id: string; user_id?: string; document_type?: string; submitted_at?: string; created_at?: string };
    type UserRow = { id: string; full_name?: string; email?: string; role?: string; deactivated_at?: string; created_at?: string };
    type BookingRow = { id: string; booking_number?: string; created_at?: string };
    type FailureRow = { id: string; source?: string; event_type?: string; created_at?: string };
    type TxRow = { id: string; amount: number; currency?: string; status?: string; created_at?: string };
    type RefundRow = { id: string; amount: number; currency?: string; created_at?: string };
    type DisputeRow = { id: string; booking_id?: string; opened_by?: string; created_at?: string };

    const activities: ActivityItem[] = [];

    // Process pending payouts
    if (pendingPayouts.status === 'fulfilled' && pendingPayouts.value.data) {
      const { data: payouts } = pendingPayouts.value;
      if (payouts && payouts.length > 0) {
        const providerIds = [...new Set((payouts as PayoutRow[]).map((p) => p.provider_id).filter(Boolean))];
        const { data: providers } = providerIds.length > 0
          ? await supabase
              .from('providers')
              .select('id, business_name')
              .in('id', providerIds)
          : { data: [] };
        
        const providerMap = new Map((providers || []).map((p: ProviderRow) => [p.id, p]));
        
        (payouts as PayoutRow[]).forEach((payout) => {
          const provider = providerMap.get(payout.provider_id);
          activities.push({
            id: `payout-${payout.id}`,
            type: 'payout_request',
            title: 'Payout Request',
            message: provider 
              ? `${provider.business_name} requested payout of ${payout.currency} ${payout.amount.toFixed(2)}`
              : `Payout request of ${payout.currency} ${payout.amount.toFixed(2)}`,
            timestamp: payout.created_at,
            link: `/admin/payouts?status=pending`,
            priority: 'high',
          });
        });
      }
    }

    // Process pending verifications
    if (pendingVerifications.status === 'fulfilled' && pendingVerifications.value.data) {
      const { data: verifications } = pendingVerifications.value;
      if (verifications && verifications.length > 0) {
        // Get user names
        const userIds = [...new Set((verifications as VerificationRow[]).map((v) => v.user_id).filter(Boolean))];
        const { data: users } = userIds.length > 0
          ? await supabase
              .from('users')
              .select('id, full_name, email')
              .in('id', userIds)
          : { data: [] };
        
        const userMap = new Map((users || []).map((u: UserRow) => [u.id, u]));
        
        (verifications as VerificationRow[]).forEach((verification) => {
          const user = userMap.get(verification.user_id);
          activities.push({
            id: `verification-${verification.id}`,
            type: 'verification',
            title: 'Identity Verification',
            message: user
              ? `${user.full_name || user.email} submitted ${verification.document_type ?? "identity"} verification`
              : `New ${verification.document_type ?? "identity"} verification submitted`,
            timestamp: verification.submitted_at || verification.created_at,
            link: ADMIN_ACTIVITY_LINKS.manualVerificationsPending,
            priority: 'high',
          });
        });
      }
    }

    if (isSuperadmin && pendingDiditSessions.status === "fulfilled" && pendingDiditSessions.value.data) {
      const { data: diditSessions } = pendingDiditSessions.value;
      if (diditSessions && diditSessions.length > 0) {
        type DiditSessionRow = {
          id: string;
          user_id: string;
          persona_type?: string | null;
          status?: string | null;
          updated_at?: string | null;
          created_at?: string | null;
          users?: { full_name?: string | null; email?: string | null } | null;
        };
        (diditSessions as DiditSessionRow[]).forEach((session) => {
          const user = session.users;
          const persona = session.persona_type === "provider" ? "provider" : "customer";
          activities.push({
            id: `didit-session-${session.id}`,
            type: "verification",
            title: "Didit verification review",
            message: user
              ? `${user.full_name || user.email} — ${persona} session pending review (Didit)`
              : `${persona} Didit session pending review`,
            timestamp: session.updated_at || session.created_at || new Date().toISOString(),
            link: ADMIN_ACTIVITY_LINKS.verificationsPending,
            priority: "high",
          });
        });
      }
    }

    // Process pending provider approvals
    if (pendingProviderApprovals.status === 'fulfilled' && pendingProviderApprovals.value.data) {
      const { data: providers } = pendingProviderApprovals.value;
      if (providers && providers.length > 0) {
        (providers as ProviderRow[]).forEach((provider) => {
          activities.push({
            id: `provider-approval-${provider.id}`,
            type: 'provider_approval',
            title: 'Provider Approval',
            message: `${provider.business_name || 'New provider'} is waiting for approval`,
            timestamp: provider.created_at,
            link: `/admin/providers?status=pending_approval`,
            priority: 'high',
          });
        });
      }
    }

    // Process new providers (last 7 days)
    if (newProviders.status === 'fulfilled' && newProviders.value.data) {
      const { data: providers } = newProviders.value;
      if (providers && providers.length > 0) {
        (providers as ProviderRow[]).forEach((provider) => {
          if (provider.status !== 'pending_approval') {
            activities.push({
              id: `new-provider-${provider.id}`,
              type: 'new_provider',
              title: 'New Provider',
              message: `${provider.business_name || 'New provider'} joined the platform`,
              timestamp: provider.created_at,
              link: `/admin/providers`,
              priority: 'medium',
            });
          }
        });
      }
    }

    // Process recent bookings
    if (recentBookings.status === 'fulfilled' && recentBookings.value.data) {
      const { data: bookings } = recentBookings.value;
      if (bookings && bookings.length > 0) {
        (bookings as BookingRow[]).forEach((booking) => {
          activities.push({
            id: `booking-${booking.id}`,
            type: 'booking',
            title: 'New Booking',
            message: `Booking #${booking.booking_number ?? booking.id.slice(0, 8)} created`,
            timestamp: booking.created_at,
            link: ADMIN_ACTIVITY_LINKS.bookingDetail(booking.id),
            priority: 'medium',
          });
        });
      }
    }

    // Process webhook failures
    if (webhookFailures.status === 'fulfilled' && webhookFailures.value.data) {
      const { data: failures } = webhookFailures.value;
      if (failures && failures.length > 0) {
        (failures as FailureRow[]).forEach((failure) => {
          activities.push({
            id: `webhook-${failure.id}`,
            type: 'webhook_failure',
            title: 'Webhook Failure',
            message: `${failure.source || 'System'} webhook failed: ${failure.event_type || 'Unknown event'}`,
            timestamp: failure.created_at,
            link: ADMIN_ACTIVITY_LINKS.webhooksFailures,
            priority: 'high',
          });
        });
      }
    }

    // Process failed payments
    if (failedPayments.status === 'fulfilled' && failedPayments.value.data) {
      const { data: transactions } = failedPayments.value;
      if (transactions && transactions.length > 0) {
        (transactions as TxRow[]).forEach((tx) => {
          activities.push({
            id: `payment-failure-${tx.id}`,
            type: 'payment_failure',
            title: 'Payment Failed',
            message: `Payment of ${tx.currency ?? ""} ${Number(tx.amount ?? 0).toFixed(2)} failed (${tx.status ?? "unknown"})`,
            timestamp: tx.created_at,
            link: ADMIN_ACTIVITY_LINKS.financePayments,
            priority: 'high',
          });
        });
      }
    }

    // Process refundable success payments (actionable refund queue)
    if (refundablePayments.status === 'fulfilled' && refundablePayments.value.data) {
      const { data: refunds } = refundablePayments.value;
      if (refunds && refunds.length > 0) {
        (refunds as RefundRow[]).forEach((refund) => {
          activities.push({
            id: `refundable-${refund.id}`,
            type: 'refundable_payment',
            title: 'Refundable payment',
            message: `Successful payment of ${refund.currency ?? ""} ${Number(refund.amount ?? 0).toFixed(2)} can be refunded`,
            timestamp: refund.created_at ?? "",
            link: ADMIN_ACTIVITY_LINKS.refundsSuccess,
            priority: 'high',
          });
        });
      }
    }

    // Process high-value transactions
    if (highValueTransactions.status === 'fulfilled' && highValueTransactions.value.data) {
      const { data: transactions } = highValueTransactions.value;
      if (transactions && transactions.length > 0) {
        (transactions as TxRow[]).forEach((tx) => {
          activities.push({
            id: `high-value-${tx.id}`,
            type: 'high_value_transaction',
            title: 'High-Value Transaction',
            message: `Large payment: ${tx.currency ?? ""} ${Number(tx.amount ?? 0).toFixed(2)}`,
            timestamp: tx.created_at,
            link: ADMIN_ACTIVITY_LINKS.financePayments,
            priority: 'medium',
          });
        });
      }
    }

    // Process provider violations
    if (providerViolations.status === 'fulfilled' && providerViolations.value.data) {
      const { data: providers } = providerViolations.value;
      if (providers && providers.length > 0) {
        (providers as ProviderRow[]).forEach((provider) => {
          activities.push({
            id: `provider-violation-${provider.id}`,
            type: 'provider_violation',
            title: 'Provider Suspended',
            message: `${provider.business_name || 'Provider'} was suspended`,
            timestamp: provider.updated_at || provider.created_at,
            link: ADMIN_ACTIVITY_LINKS.providersSuspended,
            priority: 'high',
          });
        });
      }
    }

    // Process account issues
    if (accountIssues.status === 'fulfilled' && accountIssues.value.data) {
      const { data: users } = accountIssues.value;
      if (users && users.length > 0) {
        (users as UserRow[]).forEach((user) => {
          activities.push({
            id: `account-issue-${user.id}`,
            type: 'account_issue',
            title: 'Account Deactivated',
            message: `${user.full_name || user.email} (${user.role}) account was deactivated`,
            timestamp: user.deactivated_at || user.created_at,
            link: ADMIN_ACTIVITY_LINKS.users,
            priority: 'medium',
          });
        });
      }
    }

    // Process disputes
    if (disputes.status === 'fulfilled' && disputes.value.data) {
      const { data: bookingDisputes } = disputes.value;
      if (bookingDisputes && bookingDisputes.length > 0) {
        // Get booking numbers
        const bookingIds = [...new Set((bookingDisputes as DisputeRow[]).map((d) => d.booking_id).filter(Boolean))];
        const { data: bookings } = bookingIds.length > 0
          ? await supabase
              .from('bookings')
              .select('id, booking_number')
              .eq('tenant_id', tenantId)
              .in('id', bookingIds)
          : { data: [] };
        
        const bookingMap = new Map((bookings || []).map((b: BookingRow) => [b.id, b]));
        
        (bookingDisputes as DisputeRow[]).forEach((dispute) => {
          const booking = bookingMap.get(dispute.booking_id);
          activities.push({
            id: `dispute-${dispute.id}`,
            type: 'dispute',
            title: 'Booking Dispute',
            message: `Dispute opened by ${dispute.opened_by ?? "unknown"} for booking #${booking?.booking_number ?? dispute.booking_id?.slice(0, 8) ?? dispute.id.slice(0, 8)}`,
            timestamp: dispute.created_at ?? "",
            link: ADMIN_ACTIVITY_LINKS.disputesOpen,
            priority: 'high',
          });
        });
      }
    }

    // Process Provider Ops: new leads
    if (opsNewLeads.status === 'fulfilled' && opsNewLeads.value.data) {
      type LeadRow = { id: string; name?: string; source?: string; created_at?: string };
      const { data: leads } = opsNewLeads.value;
      if (leads && leads.length > 0) {
        (leads as LeadRow[]).forEach((lead) => {
          activities.push({
            id: `ops-lead-${lead.id}`,
            type: 'ops_new_lead',
            title: 'New Provider Lead',
            message: `${lead.name || 'Unnamed lead'} added via ${lead.source || 'manual'}`,
            timestamp: lead.created_at ?? "",
            link: ADMIN_ACTIVITY_LINKS.opsLeadsNew,
            priority: 'medium',
          });
        });
      }
    }

    // Process Provider Ops: stalled onboarding
    if (opsStalledOnboarding.status === 'fulfilled' && opsStalledOnboarding.value.data) {
      type TrackingRow = { id: string; user_id?: string; current_step?: number; last_progress_at?: string };
      const { data: stalled } = opsStalledOnboarding.value;
      if (stalled && stalled.length > 0) {
        (stalled as TrackingRow[]).forEach((t) => {
          activities.push({
            id: `ops-stalled-${t.id}`,
            type: 'ops_stalled_onboarding',
            title: 'Stalled Onboarding',
            message: `Provider onboarding stalled at step ${t.current_step ?? '?'}`,
            timestamp: t.last_progress_at ?? "",
            link: ADMIN_ACTIVITY_LINKS.opsTrackerStalled,
            priority: 'high',
          });
        });
      }
    }

    // Process pending user reports
    if (pendingUserReports.status === 'fulfilled' && pendingUserReports.value.data) {
      type ReportRow = { id: string; report_type?: string; created_at?: string };
      const { data: reports } = pendingUserReports.value;
      if (reports && reports.length > 0) {
        (reports as ReportRow[]).forEach((report) => {
          const direction = report.report_type === 'customer_reported_provider'
            ? 'Customer reported a provider'
            : 'Provider reported a customer';
          activities.push({
            id: `user-report-${report.id}`,
            type: 'user_report',
            title: 'User Report',
            message: direction,
            timestamp: report.created_at ?? "",
            link: ADMIN_ACTIVITY_LINKS.userReportsPending,
            priority: 'high',
          });
        });
      }
    }

    let safetyRowsInFeed = 0;
    if (isSuperadmin) {
      try {
        const rows = safetyGlobalView
          ? await fetchOpenSafetyEventsGlobal(supabase, 12)
          : await fetchOpenSafetyEventsForTenant(supabase, tenantId, tenantProviderIds, 12);
        safetyRowsInFeed = rows.length;
        for (const row of rows) {
          const title =
            row.event_type === "panic"
              ? "Safety panic"
              : row.event_type === "check_in"
                ? "Safety check-in"
                : "Safety escalation";
          activities.push({
            id: `safety-${row.id}`,
            type: "safety_event",
            title,
            message: `Open incident (${row.status}) — review in Safety logs`,
            timestamp: row.created_at,
            link: ADMIN_ACTIVITY_LINKS.safetyLogs,
            priority: "critical",
          });
        }
      } catch {
        /* ignore */
      }
    }

    const priorityRank = (p: string) => (p === "critical" ? 3 : p === "high" ? 2 : p === "medium" ? 1 : 0);
    activities.sort((a, b) => {
      const byPri = priorityRank(b.priority) - priorityRank(a.priority);
      if (byPri !== 0) return byPri;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const returnedActivities = activities.slice(0, 20);

    // Per-bucket counts for diagnostics (informational types omitted from badge)
    const counts = {
      pending_payouts: pendingPayouts.status === 'fulfilled' && pendingPayouts.value.data
        ? pendingPayouts.value.data.length
        : 0,
      pending_verifications:
        (pendingVerifications.status === "fulfilled" && pendingVerifications.value.data
          ? pendingVerifications.value.data.length
          : 0) +
        (isSuperadmin &&
        pendingDiditSessions.status === "fulfilled" &&
        pendingDiditSessions.value.data
          ? pendingDiditSessions.value.data.length
          : 0),
      pending_provider_approvals: pendingProviderApprovals.status === 'fulfilled' && pendingProviderApprovals.value.data
        ? pendingProviderApprovals.value.data.length
        : 0,
      webhook_failures: webhookFailures.status === 'fulfilled' && webhookFailures.value.data
        ? webhookFailures.value.data.length
        : 0,
      payment_failures: failedPayments.status === 'fulfilled' && failedPayments.value.data
        ? failedPayments.value.data.length
        : 0,
      refundable_payments: refundablePayments.status === 'fulfilled' && refundablePayments.value.data
        ? refundablePayments.value.data.length
        : 0,
      /** @deprecated use refundable_payments */
      refund_requests: refundablePayments.status === 'fulfilled' && refundablePayments.value.data
        ? refundablePayments.value.data.length
        : 0,
      disputes: disputes.status === 'fulfilled' && disputes.value.data
        ? disputes.value.data.length
        : 0,
      provider_violations: providerViolations.status === 'fulfilled' && providerViolations.value.data
        ? providerViolations.value.data.length
        : 0,
      pending_user_reports: pendingUserReports.status === 'fulfilled' && pendingUserReports.value.data
        ? pendingUserReports.value.data.length
        : 0,
      ops_new_leads: opsNewLeads.status === 'fulfilled' && opsNewLeads.value.data
        ? opsNewLeads.value.data.length
        : 0,
      ops_stalled: opsStalledOnboarding.status === 'fulfilled' && opsStalledOnboarding.value.data
        ? opsStalledOnboarding.value.data.length
        : 0,
      safety_in_feed: safetyRowsInFeed,
    };

    const totalUnread = computeActivityTotalUnreadFromCounts(counts);

    return successResponse({
      activities: returnedActivities,
      counts,
      total_unread: totalUnread,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch activity notifications');
  }
}
