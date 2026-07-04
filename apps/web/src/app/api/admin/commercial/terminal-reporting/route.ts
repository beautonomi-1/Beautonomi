/**
 * GET /api/admin/commercial/terminal-reporting
 *
 * Aggregated terminal metrics for Superadmin dashboards.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerRowsForTenant,
  normalizeAdminLedgerRange,
} from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);

    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const supabaseServer = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const rangeStart = startDate || undefined;
    const rangeEnd = endDate || undefined;
    const normalizedRange = normalizeAdminLedgerRange({
      start: rangeStart ?? null,
      end: rangeEnd ?? null,
    });

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
      .select("order_status, commercial_model, total_amount, currency, invoice_status, updated_at")
      .eq("tenant_id", tenantId);

    const orders = orderError ? [] : (orderStats ?? []);
    const ordersByStatus: Record<string, number> = {};
    const revenueByModel: Record<string, number> = {};
    const PAID_STATUSES = new Set(["paid"]);

    let paidOrdersInRange = 0;

    for (const o of orders) {
      if (o.order_status) {
        ordersByStatus[o.order_status] = (ordersByStatus[o.order_status] ?? 0) + 1;
      }
      const isPaid = PAID_STATUSES.has(String(o.invoice_status ?? ""));
      const updatedAt = o.updated_at ? new Date(String(o.updated_at)).toISOString() : null;
      const inRange =
        !normalizedRange.start && !normalizedRange.end
          ? true
          : updatedAt != null &&
            (!normalizedRange.start || updatedAt >= normalizedRange.start) &&
            (!normalizedRange.end || updatedAt <= normalizedRange.end);

      if (isPaid && inRange) {
        paidOrdersInRange += 1;
      }

      const countsTowardRevenue =
        isPaid &&
        inRange &&
        !["cancelled", "refunded", "failed"].includes(String(o.order_status ?? ""));
      if (countsTowardRevenue && o.commercial_model) {
        revenueByModel[o.commercial_model] =
          (revenueByModel[o.commercial_model] ?? 0) + Number(o.total_amount ?? 0);
      }
    }

    const totalOrderRevenue = Object.values(revenueByModel).reduce((a, b) => a + b, 0);

    let ledgerTerminalRevenue = 0;
    let ledgerTerminalGatewayFees = 0;
    if (rangeStart && rangeEnd) {
      try {
        const ledgerRows = await fetchFinanceLedgerRowsForTenant(supabaseServer, tenantId, {
          start: rangeStart,
          end: rangeEnd,
        });
        const agg = aggregateFinanceLedgerRows(ledgerRows);
        ledgerTerminalRevenue = agg.terminal_revenue_gross;
        ledgerTerminalGatewayFees = agg.terminal_gateway_fees;
      } catch (ledgerErr) {
        console.warn("Terminal reporting ledger parity fetch failed:", ledgerErr);
      }
    }

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
      paid_orders_in_period: paidOrdersInRange,
      finance_parity:
        rangeStart && rangeEnd
          ? {
              period: { start_date: rangeStart, end_date: rangeEnd },
              ledger_terminal_revenue_gross: ledgerTerminalRevenue,
              ledger_terminal_gateway_fees: ledgerTerminalGatewayFees,
              order_book_revenue: totalOrderRevenue,
              order_count: paidOrdersInRange,
              basis_note:
                "Ledger metrics match Finance overview terminal_commerce panel; order_book_revenue sums terminal_orders.total_amount (paid, in-range).",
            }
          : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load terminal reporting");
  }
}
