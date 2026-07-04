import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  fetchFinanceLedgerRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows, platformRevenueNetFromAggregate, gatewayFeesTotalFromAggregate } from "@/lib/admin/aggregate-finance-ledger-rows";
import { normalizeBookingChannel } from "@/lib/reports/booking-channel-breakdown";
import { eachUtcDay } from "@/lib/reports/constants";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, 1y

    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    /** Tenant-scoped daily counts (bookings / providers) or customer users tied to this tenant (preferred home + activity sample). */
    const getDailyTimeSeries = async (
      table: string,
      dateField: string = "created_at",
      extraFilter?: { column: string; value: string }
    ) => {
      let query = supabase
        .from(table)
        .select(dateField)
        .gte(dateField, startDate.toISOString())
        .order(dateField, { ascending: true });

      if (table === "bookings" || table === "providers") {
        query = query.eq("tenant_id", tenantId);
      }
      if (extraFilter) {
        query = query.eq(extraFilter.column, extraFilter.value);
      }
      if (table === "users") {
        const { data: createdRows, error: usersRpcErr } = await admin.rpc("admin_users_created_at_in_scope", {
          p_tenant_id: tenantId,
          p_since: startDate.toISOString(),
          p_role: "customer",
        });
        if (usersRpcErr) {
          console.error("Error fetching users (scoped created_at):", usersRpcErr);
          return [];
        }
        const grouped: Record<string, number> = {};
        type CreatedRow = { created_at?: string };
        ((createdRows || []) as CreatedRow[]).forEach((item) => {
          const date = new Date(String(item.created_at ?? "")).toISOString().split("T")[0];
          grouped[date] = (grouped[date] || 0) + 1;
        });
        const result: Array<{ date: string; count: number }> = [];
        for (const dateStr of eachUtcDay(startDate, now)) {
          result.push({ date: dateStr, count: grouped[dateStr] || 0 });
        }
        return result;
      }

      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        return [];
      }

      const grouped2: Record<string, number> = {};
      type RowWithDate = Record<string, unknown>;
      ((data || []) as unknown as RowWithDate[]).forEach((item: RowWithDate) => {
        const date = new Date(String(item[dateField] ?? "")).toISOString().split("T")[0];
        grouped2[date] = (grouped2[date] || 0) + 1;
      });

      const result2: Array<{ date: string; count: number }> = [];
      for (const dateStr of eachUtcDay(startDate, now)) {
        result2.push({ date: dateStr, count: grouped2[dateStr] || 0 });
      }

      return result2;
    };

    // Get platform revenue time series using the canonical formula
    // §Phase 9: was summing `net` on payment/charge/refund rows only (= commission base = 0
    // when no commission is charged). Now fetches ALL ledger rows, runs the full reducer,
    // and emits platformRevenueNetFromAggregate per day — matching the Finance summary.
    const getRevenueTimeSeries = async () => {
      let data: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
      try {
        data = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startDate.toISOString(),
          end: now.toISOString(),
        });
      } catch (e) {
        console.error('Error fetching revenue:', e);
        return [];
      }

      // Bucket by day, then aggregate each day with the canonical module.
      const byDay: Record<string, typeof data> = {};
      data.forEach((item) => {
        const date = new Date(item.created_at ?? "").toISOString().split('T')[0];
        if (!byDay[date]) byDay[date] = [];
        byDay[date].push(item);
      });

      const result: Array<{ date: string; revenue: number }> = [];
      for (const dateStr of eachUtcDay(startDate, now)) {
        const dayRows = byDay[dateStr] ?? [];
        const agg = aggregateFinanceLedgerRows(dayRows);
        result.push({ date: dateStr, revenue: platformRevenueNetFromAggregate(agg) });
      }

      return result;
    };

    // Get provider status breakdown (all providers by current status)
    const getProviderStatusBreakdown = async () => {
      const { data, error } = await supabase
        .from('providers')
        .select('status')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Error fetching provider status:', error);
        return { active: 0, pending: 0, suspended: 0, rejected: 0 };
      }

      const breakdown = {
        active: 0,
        pending: 0,
        suspended: 0,
        rejected: 0,
      };

      type ProviderStatusRow = { status?: string };
      (data || []).forEach((p: ProviderStatusRow) => {
        if (p.status === 'active') breakdown.active++;
        else if (p.status === 'pending_approval') breakdown.pending++;
        else if (p.status === 'suspended') breakdown.suspended++;
        else if (p.status === 'rejected') breakdown.rejected++;
      });

      return breakdown;
    };

    // Get booking status breakdown
    const getBookingStatusBreakdown = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('status')
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', startDate.toISOString());

      if (error) {
        console.error('Error fetching booking status:', error);
        return { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
      }

      const breakdown = {
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0,
      };

      type BookingStatusRow = { status?: string };
      (data || []).forEach((b: BookingStatusRow) => {
        if (b.status === 'confirmed') breakdown.confirmed++;
        else if (b.status === 'completed') breakdown.completed++;
        else if (b.status === 'cancelled') breakdown.cancelled++;
        else if (b.status === 'no_show') breakdown.no_show++;
      });

      return breakdown;
    };

    // Get top providers by revenue (merged ledger: provider in tenant OR booking in tenant)
    const getTopProviders = async () => {
      let merged: Awaited<ReturnType<typeof fetchFinanceLedgerExportRowsForTenant>>;
      try {
        merged = await fetchFinanceLedgerExportRowsForTenant(
          supabase,
          tenantId,
          { start: startDate.toISOString() },
          {
            transactionTypes: [
              "provider_earnings",
              "travel_fee",
              "tip",
              "cancellation_fee",
              "walk_in_additional_charge",
            ],
          },
        );
      } catch (err) {
        console.error("Error fetching top providers ledger:", err);
        return [];
      }

      const providerRevenue: Record<string, number> = {};
      for (const row of merged) {
        const pid = resolveFinanceLedgerRowProviderId(row);
        if (!pid) continue;
        const amt = Number(row.net ?? row.amount ?? 0);
        providerRevenue[pid] = (providerRevenue[pid] || 0) + amt;
      }

      const topProviders = Object.entries(providerRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([providerId, revenue]) => ({ provider_id: providerId, revenue }));

      // Fetch provider names
      if (topProviders.length > 0) {
        const providerIds = topProviders.map(p => p.provider_id);
        const { data: providers } = await supabase
          .from('providers')
          .select('id, business_name')
          .eq('tenant_id', tenantId)
          .in('id', providerIds);

        const providerMap = new Map((providers || []).map((p: { id: string; business_name?: string }) => [p.id, p.business_name]));

        return topProviders.map(p => ({
          provider_id: p.provider_id,
          business_name: providerMap.get(p.provider_id) || 'Unknown',
          revenue: p.revenue,
        }));
      }

      return [];
    };

    const getBookingsByChannel = async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("booking_source")
        .eq("tenant_id", tenantId)
        .gte("scheduled_at", startDate.toISOString());

      if (error) {
        console.error("Error fetching bookings by channel:", error);
        return [];
      }

      const counts = new Map<string, number>();
      (data || []).forEach((b: { booking_source?: string | null }) => {
        const channel = normalizeBookingChannel(b.booking_source);
        counts.set(channel, (counts.get(channel) ?? 0) + 1);
      });

      const total = [...counts.values()].reduce((s, c) => s + c, 0);
      return [...counts.entries()].map(([channel, count]) => ({
        channel,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }));
    };

    const getLedgerTotals = async () => {
      try {
        const rows = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startDate.toISOString(),
          end: now.toISOString(),
        });
        const agg = aggregateFinanceLedgerRows(rows);
        return {
          gateway_fees_total: gatewayFeesTotalFromAggregate(agg),
          terminal_revenue: agg.terminal_revenue_gross,
          terminal_gateway_fees: agg.terminal_gateway_fees,
        };
      } catch (e) {
        console.error("Error fetching ledger totals for analytics:", e);
        return {
          gateway_fees_total: 0,
          terminal_revenue: 0,
          terminal_gateway_fees: 0,
        };
      }
    };

    // Run all queries in parallel (users = customers only for growth chart)
    const [
      usersTimeSeries,
      providersTimeSeries,
      bookingsTimeSeries,
      revenueTimeSeries,
      providerStatusBreakdown,
      bookingStatusBreakdown,
      topProviders,
      bookingsByChannel,
      ledgerTotals,
    ] = await Promise.all([
      getDailyTimeSeries("users", "created_at"),
      getDailyTimeSeries("providers", "created_at"),
      getDailyTimeSeries("bookings", "scheduled_at"),
      getRevenueTimeSeries(),
      getProviderStatusBreakdown(),
      getBookingStatusBreakdown(),
      getTopProviders(),
      getBookingsByChannel(),
      getLedgerTotals(),
    ]);

    return successResponse({
      period,
      timeSeries: {
        users: usersTimeSeries,
        providers: providersTimeSeries,
        bookings: bookingsTimeSeries,
        revenue: revenueTimeSeries,
      },
      breakdowns: {
        providerStatus: providerStatusBreakdown,
        bookingStatus: bookingStatusBreakdown,
        bookingsByChannel,
      },
      bookingsByChannel,
      topProviders,
      gateway_fees_total: ledgerTotals.gateway_fees_total,
      terminal_revenue: ledgerTotals.terminal_revenue,
      terminal_gateway_fees: ledgerTotals.terminal_gateway_fees,
      financeNote:
        "Gateway and terminal totals use the same ledger aggregate as Finance overview. Fee reconciliations auto-generate daily.",
      channelBasisNote:
        "Bookings use scheduled_at in the selected period (matches the bookings report). Channel labels from booking_source (null treated as online). Counts only — not revenue.",
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load analytics');
  }
}
