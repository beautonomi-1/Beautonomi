import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  fetchFinanceLedgerRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

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

    // Get daily time series data (optional extra filter, e.g. for users by role)
    const getDailyTimeSeries = async (
      table: string,
      dateField: string = 'created_at',
      extraFilter?: { column: string; value: string }
    ) => {
      let query = supabase
        .from(table)
        .select(dateField)
        .gte(dateField, startDate.toISOString())
        .order(dateField, { ascending: true });
      if (extraFilter) {
        query = query.eq(extraFilter.column, extraFilter.value);
      }
      const { data, error } = await query;

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        return [];
      }

      const grouped: Record<string, number> = {};
      type RowWithDate = Record<string, unknown>;
      ((data || []) as unknown as RowWithDate[]).forEach((item: RowWithDate) => {
        const date = new Date(String(item[dateField] ?? "")).toISOString().split('T')[0];
        grouped[date] = (grouped[date] || 0) + 1;
      });

      // Fill in missing dates with 0
      const result: Array<{ date: string; count: number }> = [];
      const current = new Date(startDate);
      while (current <= now) {
        const dateStr = current.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          count: grouped[dateStr] || 0,
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    };

    // Get revenue time series
    const getRevenueTimeSeries = async () => {
      let data: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
      try {
        data = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startDate.toISOString(),
          end: now.toISOString(),
        }, {
          transactionTypes: ['payment', 'additional_charge_payment', 'refund'],
        });
      } catch (e) {
        console.error('Error fetching revenue:', e);
        return [];
      }

      const grouped: Record<string, number> = {};
      type RevenueRow = { created_at?: string; net?: number; transaction_type?: string };
      (data || []).forEach((item: RevenueRow) => {
        const date = new Date(item.created_at ?? "").toISOString().split('T')[0];
        const amount = item.transaction_type === 'refund' ? -Math.abs(item.net ?? 0) : Math.abs(item.net ?? 0);
        grouped[date] = (grouped[date] || 0) + amount;
      });

      const result: Array<{ date: string; revenue: number }> = [];
      const current = new Date(startDate);
      while (current <= now) {
        const dateStr = current.toISOString().split('T')[0];
        result.push({
          date: dateStr,
          revenue: grouped[dateStr] || 0,
        });
        current.setDate(current.getDate() + 1);
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
        .gte('created_at', startDate.toISOString());

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
          { transactionTypes: ["provider_earnings", "travel_fee", "tip"] },
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

    // Run all queries in parallel (users = customers only for growth chart)
    const [
      usersTimeSeries,
      providersTimeSeries,
      bookingsTimeSeries,
      revenueTimeSeries,
      providerStatusBreakdown,
      bookingStatusBreakdown,
      topProviders,
    ] = await Promise.all([
      getDailyTimeSeries('users', 'created_at', { column: 'role', value: 'customer' }),
      getDailyTimeSeries('providers', 'created_at'),
      getDailyTimeSeries('bookings', 'created_at'),
      getRevenueTimeSeries(),
      getProviderStatusBreakdown(),
      getBookingStatusBreakdown(),
      getTopProviders(),
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
      },
      topProviders,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load analytics');
  }
}
