import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireRoleInApi, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchMergedFinanceLedgerSliceForTenant } from "@/lib/admin/finance-ledger-tenant";

/**
 * GET /api/admin/activity
 * Get recent activity notifications for admin dashboard (header bell).
 * Any admin role can load; uses service client + tenant scoping (same as nav-counts).
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const supabase = getSupabaseAdmin();

    const tenantId = await resolveAdminApiTenantId(request);

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all activity types in parallel
    const [
      pendingPayouts,
      pendingVerifications,
      newProviders,
      recentBookings,
      pendingProviderApprovals,
      webhookFailures,
      failedPayments,
      refundRequests,
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
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(10),
      
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
      
      // Webhook failures (last 24 hours)
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
          const rows = await fetchMergedFinanceLedgerSliceForTenant(
            supabase,
            tenantId,
            { start: last7Days.toISOString(), end: null },
            { transactionType: 'refund' },
            10,
          );
          return { data: rows, error: null };
        } catch (e) {
          console.error('activity refunds ledger merge:', e);
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
      
      // Provider violations/suspensions
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .in('status', ['suspended', 'banned', 'inactive'])
        .gte('updated_at', last7Days.toISOString())
        .order('updated_at', { ascending: false })
        .limit(10),
      
      // Account issues (deactivated, suspended users)
      supabase
        .from('users')
        .select('id, full_name, email, role, is_active, deactivated_at, created_at')
        .or('is_active.eq.false,deactivated_at.not.is.null')
        .gte('deactivated_at', last7Days.toISOString())
        .order('deactivated_at', { ascending: false })
        .limit(10),
      
      // Booking disputes (open disputes)
      supabase
        .from('booking_disputes')
        .select('id, booking_id, reason, status, opened_by, created_at, bookings!inner(tenant_id)')
        .eq('bookings.tenant_id', tenantId)
        .eq('status', 'open')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),

      // Provider Ops: new leads (last 7 days)
      (async () => {
        try {
          const { data, error } = await supabase
            .from('provider_leads')
            .select('id, name, source, commercial_stage, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', last7Days.toISOString())
            .order('created_at', { ascending: false })
            .limit(5);
          return { data: data ?? [], error };
        } catch { return { data: [], error: null }; }
      })(),

      // Provider Ops: stalled onboarding
      (async () => {
        try {
          const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from('provider_onboarding_tracking')
            .select('id, user_id, status, current_step, last_progress_at')
            .eq('tenant_id', tenantId)
            .in('status', ['in_progress', 'stalled'])
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
            link: `/admin/verifications?status=pending`,
            priority: 'high',
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
            link: `/admin/bookings`,
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
            link: `/admin/webhooks`,
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
            link: `/admin/finance`,
            priority: 'high',
          });
        });
      }
    }

    // Process refund requests
    if (refundRequests.status === 'fulfilled' && refundRequests.value.data) {
      const { data: refunds } = refundRequests.value;
      if (refunds && refunds.length > 0) {
        (refunds as RefundRow[]).forEach((refund) => {
          activities.push({
            id: `refund-${refund.id}`,
            type: 'refund_request',
            title: 'Refund Request',
            message: `Refund request for ${refund.currency ?? ""} ${Number(refund.amount ?? 0).toFixed(2)}`,
            timestamp: refund.created_at,
            link: `/admin/refunds`,
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
            link: `/admin/finance`,
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
            title: 'Provider Status Change',
            message: `${provider.business_name || 'Provider'} status changed to ${provider.status}`,
            timestamp: provider.updated_at || provider.created_at,
            link: `/admin/providers?status=${provider.status}`,
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
            link: `/admin/users`,
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
            link: `/admin/bookings`,
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
            link: `/admin/provider-ops/leads`,
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
            link: `/admin/provider-ops/tracker`,
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
            link: `/admin/user-reports`,
            priority: 'high',
          });
        });
      }
    }

    activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Get counts for badge
    const counts = {
      pending_payouts: pendingPayouts.status === 'fulfilled' && pendingPayouts.value.data
        ? pendingPayouts.value.data.length
        : 0,
      pending_verifications: pendingVerifications.status === 'fulfilled' && pendingVerifications.value.data
        ? pendingVerifications.value.data.length
        : 0,
      pending_provider_approvals: pendingProviderApprovals.status === 'fulfilled' && pendingProviderApprovals.value.data
        ? pendingProviderApprovals.value.data.length
        : 0,
      webhook_failures: webhookFailures.status === 'fulfilled' && webhookFailures.value.data
        ? webhookFailures.value.data.length
        : 0,
      payment_failures: failedPayments.status === 'fulfilled' && failedPayments.value.data
        ? failedPayments.value.data.length
        : 0,
      refund_requests: refundRequests.status === 'fulfilled' && refundRequests.value.data
        ? refundRequests.value.data.length
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
    };

    const totalUnread = 
      counts.pending_payouts + 
      counts.pending_verifications + 
      counts.pending_provider_approvals +
      counts.webhook_failures +
      counts.payment_failures +
      counts.refund_requests +
      counts.disputes +
      counts.provider_violations +
      counts.pending_user_reports +
      counts.ops_new_leads +
      counts.ops_stalled;

    return successResponse({
      activities: activities.slice(0, 20), // Limit to 20 most recent
      counts,
      total_unread: totalUnread,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch activity notifications');
  }
}
