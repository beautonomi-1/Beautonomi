import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';

/**
 * GET /api/admin/activity
 * Get recent activity notifications for admin dashboard
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);
    const supabase = await getSupabaseServer();

    if (!supabase) {
      return successResponse([]);
    }

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
    ] = await Promise.allSettled([
      // Pending payouts
      supabase
        .from('payouts')
        .select('id, provider_id, amount, currency, status, scheduled_at, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Pending verifications
      supabase
        .from('user_verifications')
        .select('id, user_id, verification_type, status, submitted_at, created_at')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(10),
      
      // New providers (last 7 days)
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Recent bookings (last 24 hours)
      supabase
        .from('bookings')
        .select('id, customer_id, provider_id, booking_number, status, created_at')
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Pending provider approvals
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at')
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
      
      // Failed payment transactions (last 24 hours)
      supabase
        .from('finance_transactions')
        .select('id, transaction_type, amount, currency, status, booking_id, created_at')
        .in('status', ['failed', 'declined', 'error'])
        .gte('created_at', last24Hours.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // Refund requests (last 7 days)
      supabase
        .from('finance_transactions')
        .select('id, transaction_type, amount, currency, booking_id, created_at')
        .eq('transaction_type', 'refund')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
      
      // High-value transactions (last 24 hours, > $500 or equivalent)
      supabase
        .from('finance_transactions')
        .select('id, transaction_type, amount, currency, booking_id, created_at')
        .eq('transaction_type', 'payment')
        .gte('amount', 500)
        .gte('created_at', last24Hours.toISOString())
        .order('amount', { ascending: false })
        .limit(5),
      
      // Provider violations/suspensions
      supabase
        .from('providers')
        .select('id, user_id, business_name, status, created_at, updated_at')
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
        .select('id, booking_id, reason, status, opened_by, created_at')
        .eq('status', 'open')
        .gte('created_at', last7Days.toISOString())
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const activities: any[] = [];

    // Process pending payouts
    if (pendingPayouts.status === 'fulfilled' && pendingPayouts.value.data) {
      const { data: payouts } = pendingPayouts.value;
      if (payouts && payouts.length > 0) {
        // Get provider names
        const providerIds = [...new Set(payouts.map((p: any) => p.provider_id).filter(Boolean))];
        const { data: providers } = providerIds.length > 0
          ? await supabase
              .from('providers')
              .select('id, business_name')
              .in('id', providerIds)
          : { data: [] };
        
        const providerMap = new Map((providers || []).map((p: any) => [p.id, p]));
        
        payouts.forEach((payout: any) => {
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
        const userIds = [...new Set(verifications.map((v: any) => v.user_id).filter(Boolean))];
        const { data: users } = userIds.length > 0
          ? await supabase
              .from('users')
              .select('id, full_name, email')
              .in('id', userIds)
          : { data: [] };
        
        const userMap = new Map((users || []).map((u: any) => [u.id, u]));
        
        verifications.forEach((verification: any) => {
          const user = userMap.get(verification.user_id);
          activities.push({
            id: `verification-${verification.id}`,
            type: 'verification',
            title: 'Identity Verification',
            message: user
              ? `${user.full_name || user.email} submitted ${verification.verification_type} verification`
              : `New ${verification.verification_type} verification submitted`,
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
        providers.forEach((provider: any) => {
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
        providers.forEach((provider: any) => {
          // Only add if not already added as pending approval
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
        bookings.forEach((booking: any) => {
          activities.push({
            id: `booking-${booking.id}`,
            type: 'booking',
            title: 'New Booking',
            message: `Booking #${booking.booking_number || booking.id.slice(0, 8)} created`,
            timestamp: booking.created_at,
            link: `/admin/bookings`,
            priority: 'medium',
          });
        });
      }
    }

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Process webhook failures
    if (webhookFailures.status === 'fulfilled' && webhookFailures.value.data) {
      const { data: failures } = webhookFailures.value;
      if (failures && failures.length > 0) {
        failures.forEach((failure: any) => {
          activities.push({
            id: `webhook-${failure.id}`,
            type: 'webhook_failure',
            title: 'Webhook Failure',
            message: `${failure.source || 'System'} webhook failed: ${failure.event_type || 'Unknown event'}`,
            timestamp: failure.created_at,
            link: `/admin/webhooks/failures`,
            priority: 'high',
          });
        });
      }
    }

    // Process failed payments
    if (failedPayments.status === 'fulfilled' && failedPayments.value.data) {
      const { data: transactions } = failedPayments.value;
      if (transactions && transactions.length > 0) {
        transactions.forEach((tx: any) => {
          activities.push({
            id: `payment-failure-${tx.id}`,
            type: 'payment_failure',
            title: 'Payment Failed',
            message: `Payment of ${tx.currency} ${tx.amount.toFixed(2)} failed (${tx.status})`,
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
        refunds.forEach((refund: any) => {
          activities.push({
            id: `refund-${refund.id}`,
            type: 'refund_request',
            title: 'Refund Request',
            message: `Refund request for ${refund.currency} ${refund.amount.toFixed(2)}`,
            timestamp: refund.created_at,
            link: `/admin/finance`,
            priority: 'high',
          });
        });
      }
    }

    // Process high-value transactions
    if (highValueTransactions.status === 'fulfilled' && highValueTransactions.value.data) {
      const { data: transactions } = highValueTransactions.value;
      if (transactions && transactions.length > 0) {
        transactions.forEach((tx: any) => {
          activities.push({
            id: `high-value-${tx.id}`,
            type: 'high_value_transaction',
            title: 'High-Value Transaction',
            message: `Large payment: ${tx.currency} ${tx.amount.toFixed(2)}`,
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
        providers.forEach((provider: any) => {
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
        users.forEach((user: any) => {
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
        const bookingIds = [...new Set(bookingDisputes.map((d: any) => d.booking_id).filter(Boolean))];
        const { data: bookings } = bookingIds.length > 0
          ? await supabase
              .from('bookings')
              .select('id, booking_number')
              .in('id', bookingIds)
          : { data: [] };
        
        const bookingMap = new Map((bookings || []).map((b: any) => [b.id, b]));
        
        bookingDisputes.forEach((dispute: any) => {
          const booking = bookingMap.get(dispute.booking_id);
          activities.push({
            id: `dispute-${dispute.id}`,
            type: 'dispute',
            title: 'Booking Dispute',
            message: `Dispute opened by ${dispute.opened_by} for booking #${booking?.booking_number || dispute.booking_id.slice(0, 8)}`,
            timestamp: dispute.created_at,
            link: `/admin/bookings`,
            priority: 'high',
          });
        });
      }
    }

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
    };

    const totalUnread = 
      counts.pending_payouts + 
      counts.pending_verifications + 
      counts.pending_provider_approvals +
      counts.webhook_failures +
      counts.payment_failures +
      counts.refund_requests +
      counts.disputes +
      counts.provider_violations;

    return successResponse({
      activities: activities.slice(0, 20), // Limit to 20 most recent
      counts,
      total_unread: totalUnread,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch activity notifications');
  }
}
