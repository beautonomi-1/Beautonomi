/**
 * GET /api/admin/commercial/terminal-reporting
 *
 * Aggregated terminal metrics for Superadmin dashboards.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);

    const tenantId = await resolveAdminApiTenantId(request);
    const flagEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.SUPERADMIN_TERMINAL_INSIGHTS,
      tenantId,
    );
    if (!flagEnabled) {
      return errorResponse("Terminal insights is not enabled.", "FEATURE_DISABLED", 403);
    }

    const supabase = getSupabaseAdmin();

    // Provider profiles aggregated
    const { data: profiles, error: profilesError } = await supabase
      .from("provider_payment_terminal_profile")
      .select("terminal_ownership_status, terminal_provider, interested_in_platform_terminal, has_payment_terminal, providers!inner(tenant_id)")
      .eq("providers.tenant_id", tenantId);

    if (profilesError) {
      return errorResponse("Failed to load reporting data", "LOAD_ERROR", 500, profilesError);
    }

    const all = profiles ?? [];
    const withTerminal = all.filter((p) => p.has_payment_terminal === true).length;
    const withoutTerminal = all.filter((p) => p.has_payment_terminal === false).length;
    const planning = all.filter((p) => p.terminal_ownership_status === "planning_to_get_terminal").length;
    const interested = all.filter((p) => p.interested_in_platform_terminal === "yes").length;
    const maybeInterested = all.filter((p) => p.interested_in_platform_terminal === "maybe_later").length;

    // Vendor breakdown
    const vendorBreakdown: Record<string, number> = {};
    for (const p of all) {
      if (p.terminal_provider) {
        vendorBreakdown[p.terminal_provider] = (vendorBreakdown[p.terminal_provider] ?? 0) + 1;
      }
    }

    // Order stats (when e-commerce is active)
    const { data: orderStats, error: orderError } = await supabase
      .from("terminal_orders")
      .select("order_status, commercial_model, total_amount, currency")
      .eq("tenant_id", tenantId);

    const orders = orderError ? [] : (orderStats ?? []);
    const ordersByStatus: Record<string, number> = {};
    const revenueByModel: Record<string, number> = {};
    for (const o of orders) {
      if (o.order_status) ordersByStatus[o.order_status] = (ordersByStatus[o.order_status] ?? 0) + 1;
      if (o.commercial_model) revenueByModel[o.commercial_model] = (revenueByModel[o.commercial_model] ?? 0) + Number(o.total_amount ?? 0);
    }

    const totalOrderRevenue = Object.values(revenueByModel).reduce((a, b) => a + b, 0);

    return successResponse({
      providers_with_terminals: withTerminal,
      providers_without_terminals: withoutTerminal,
      providers_planning: planning,
      providers_interested: interested,
      providers_maybe_interested: maybeInterested,
      total_captured: all.length,
      vendor_breakdown: vendorBreakdown,
      orders_by_status: ordersByStatus,
      revenue_by_model: revenueByModel,
      total_order_revenue: totalOrderRevenue,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal reporting");
  }
}
