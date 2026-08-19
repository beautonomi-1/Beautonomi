import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchAllProviderIdsForTenant } from "@/lib/tenant/admin-tenant-scope";
import { countRefundableSuccessPaymentTxsForTenant } from "@/lib/admin/refundable-payment-transactions";
import { countAllOpenSafetyEvents, countOpenSafetyEventsForTenant } from "@/lib/admin/safety-events-tenant-scope";
import { USER_VERIFICATION_QUEUE_STATUSES } from "@/lib/admin/verification-queue-statuses";
import { filterVerificationsForAdminTenant } from "@/lib/admin/verification-tenant-access";

/**
 * GET /api/admin/nav-counts
 * Returns pending/open counts for admin sidebar badges.
 * Keys match admin nav `href`s so the shell can show counts per menu item.
 * Uses any-admin auth (not a single section) so finance/trust/support roles still get badges.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
    const isSuperadmin = String(user?.role ?? "").toLowerCase() === "superadmin";
    const scopeGlobalSafety = new URL(request.url).searchParams.get("scope") === "global";
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const tenantProviderIds = await fetchAllProviderIdsForTenant(supabase, tenantId);

    const [
      verificationsResult,
      payoutsResult,
      supportTicketsResult,
      refundsResult,
      disputesResult,
      providersPendingResult,
      bookingsPendingResult,
      userReportsResult,
      contentReportsResult,
      userBlocksResult,
      productOrdersPendingResult,
      productReturnsResult,
      providerSubsPastDueResult,
      webhookFailures24hResult,
      opsNewLeadsResult,
      opsStalledResult,
      opsActivationResult,
      safetyOpenResult,
      paystackTerminalSetupResult,
      diditSessionsResult,
      terminalMerchantOnboardingResult,
    ] = await Promise.all([
      (async () => {
        const { data: rows, error } = await supabase
          .from("user_verifications")
          .select("id, tenant_id, user_id, submitted_at")
          .in("status", [...USER_VERIFICATION_QUEUE_STATUSES])
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
        if (error) return { count: 0 };
        const scoped = await filterVerificationsForAdminTenant(supabase, tenantId, rows ?? []);
        return { count: scoped.length };
      })(),
      supabase
        .from("payouts")
        .select("id, providers!inner(tenant_id)", { count: "exact", head: true })
        .in("status", ["pending", "processing"])
        .eq("providers.tenant_id", tenantId),
      (async () => {
        // Count only actionable tickets (needs_agent_response = true) rather than all
        // open+in_progress — this is the "badge you must clear" number that
        // tells agents how much work is waiting for them.
        if (isSuperadmin || user.role === "support_agent") {
          const [actionableResult, slaBreachedResult] = await Promise.all([
            supabase
              .from("support_tickets")
              .select("id", { count: "exact", head: true })
              .eq("needs_agent_response", true),
            supabase
              .from("support_tickets")
              .select("id", { count: "exact", head: true })
              .lt("sla_resolution_due_at", new Date().toISOString())
              .not("status", "in", '("resolved","closed")'),
          ]);
          return {
            count: actionableResult.count ?? 0,
            sla_breached: slaBreachedResult.count ?? 0,
          };
        }
        if (tenantProviderIds.length > 0) {
          const [actionableResult, slaBreachedResult] = await Promise.all([
            supabase
              .from("support_tickets")
              .select("id", { count: "exact", head: true })
              .eq("needs_agent_response", true)
              .in("provider_id", tenantProviderIds),
            supabase
              .from("support_tickets")
              .select("id", { count: "exact", head: true })
              .lt("sla_resolution_due_at", new Date().toISOString())
              .not("status", "in", '("resolved","closed")')
              .in("provider_id", tenantProviderIds),
          ]);
          return {
            count: actionableResult.count ?? 0,
            sla_breached: slaBreachedResult.count ?? 0,
          };
        }
        return { count: 0, sla_breached: 0 };
      })(),
      (async () => {
        const count = await countRefundableSuccessPaymentTxsForTenant(supabase, tenantId);
        return { count };
      })(),
      supabase
        .from("booking_disputes")
        .select("id, bookings!inner(tenant_id)", { count: "exact", head: true })
        .eq("status", "open")
        .eq("bookings.tenant_id", tenantId),
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval")
        .eq("tenant_id", tenantId),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      supabase
        .from("user_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      supabase
        .from("content_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("tenant_id", tenantId),
      supabase
        .from("user_blocks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      tenantProviderIds.length > 0
        ? supabase
            .from("product_orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .in("provider_id", tenantProviderIds)
        : Promise.resolve({ count: 0 }),
      tenantProviderIds.length > 0
        ? supabase
            .from("product_return_requests")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "escalated"])
            .in("provider_id", tenantProviderIds)
        : Promise.resolve({ count: 0 }),
      (async () => {
        try {
          const { count, error } = await supabase
            .from("provider_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("status", "past_due")
            .eq("tenant_id", tenantId);
          if (error) return { count: 0 };
          return { count: count ?? 0 };
        } catch {
          return { count: 0 };
        }
      })(),
      (async () => {
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count, error } = await supabase
            .from("webhook_events")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed")
            .gte("created_at", since);
          if (error) return { count: 0 };
          return { count: count ?? 0 };
        } catch {
          return { count: 0 };
        }
      })(),
      // Provider Ops: new leads (unassigned / new stage)
      (async () => {
        try {
          const { count, error } = await supabase
            .from("provider_leads")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .eq("commercial_stage", "new");
          if (error) return { count: 0 };
          return { count: count ?? 0 };
        } catch {
          return { count: 0 };
        }
      })(),
      // Provider Ops: stalled onboarding (no progress in 48h)
      (async () => {
        try {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { count, error } = await supabase
            .from("provider_onboarding_tracking")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("wizard_status", ["in_progress", "stalled"])
            .lt("last_progress_at", cutoff);
          if (error) return { count: 0 };
          return { count: count ?? 0 };
        } catch {
          return { count: 0 };
        }
      })(),
      // Provider Ops: providers pending activation
      supabase
        .from("providers")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "pending_approval"])
        .eq("tenant_id", tenantId),
      (async () => {
        if (!isSuperadmin) return { count: 0 };
        try {
          if (scopeGlobalSafety) {
            const n = await countAllOpenSafetyEvents(supabase);
            return { count: n };
          }
          const n = await countOpenSafetyEventsForTenant(supabase, tenantId, tenantProviderIds);
          return { count: n };
        } catch {
          return { count: 0 };
        }
      })(),
      // Paystack Virtual Terminal: setup requests + asset completion queue
      (async () => {
        if (tenantProviderIds.length === 0) return { count: 0 };
        try {
          const [setupResult, assetResult] = await Promise.all([
            (supabase.from("provider_paystack_virtual_terminal_setup_requests") as any)
              .select("id", { count: "exact", head: true })
              .in("status", ["requested", "in_progress"])
              .in("provider_id", tenantProviderIds),
            (supabase.from("provider_paystack_virtual_terminals") as any)
              .select("id", { count: "exact", head: true })
              .in("provider_id", tenantProviderIds)
              .in("asset_request_status", ["requested", "in_progress"])
              .is("deleted_at", null),
          ]);
          if (setupResult.error && assetResult.error) return { count: 0 };
          return {
            count: (setupResult.count ?? 0) + (assetResult.count ?? 0),
          };
        } catch {
          return { count: 0 };
        }
      })(),
      isSuperadmin
        ? supabase
            .from("identity_verification_sessions")
            .select("id", { count: "exact", head: true })
            .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
            .eq("status", "pending_review")
        : Promise.resolve({ count: 0, error: null }),
      (async () => {
        try {
          const { count, error } = await supabase
            .from("terminal_merchant_applications")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["submitted", "in_review", "info_required", "sent_to_acquirer", "awaiting_term_sheet"]);
          if (error) return { count: 0 };
          return { count: count ?? 0 };
        } catch {
          return { count: 0 };
        }
      })(),
    ]);

    const counts: Record<string, number> = {
      "/admin/verifications": verificationsResult.count ?? 0,
      "/admin/payouts": payoutsResult.count ?? 0,
      "/admin/support-tickets": supportTicketsResult.count ?? 0,
      "/admin/support-tickets/sla-breached": (supportTicketsResult as { sla_breached?: number }).sla_breached ?? 0,
      "/admin/refunds": refundsResult.count ?? 0,
      "/admin/disputes": disputesResult.count ?? 0,
      "/admin/providers": providersPendingResult.count ?? 0,
      "/admin/bookings": bookingsPendingResult.count ?? 0,
      "/admin/user-reports": userReportsResult.count ?? 0,
      "/admin/content-reports": contentReportsResult.count ?? 0,
      "/admin/user-blocks": userBlocksResult.count ?? 0,
      "/admin/ecommerce/orders": productOrdersPendingResult.count ?? 0,
      "/admin/ecommerce/returns": productReturnsResult.count ?? 0,
      "/admin/provider-subscriptions": providerSubsPastDueResult.count ?? 0,
      "/admin/webhooks": webhookFailures24hResult.count ?? 0,
      "/admin/provider-ops/leads": opsNewLeadsResult.count ?? 0,
      "/admin/provider-ops/tracker": opsStalledResult.count ?? 0,
      "/admin/provider-ops/activation": opsActivationResult.count ?? 0,
      "/admin/control-plane/safety-logs": safetyOpenResult.count ?? 0,
      "/admin/paystack-terminal": paystackTerminalSetupResult.count ?? 0,
      "/admin/identity-trust/sessions": diditSessionsResult.count ?? 0,
      "/admin/commercial/terminal-onboarding": terminalMerchantOnboardingResult.count ?? 0,
    };

    return successResponse(counts);
  } catch (error) {
    return handleApiError(error, "Failed to fetch nav counts");
  }
}
