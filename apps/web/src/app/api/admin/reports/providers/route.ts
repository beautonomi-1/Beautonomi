import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchFinanceLedgerExportRowsForTenant,
  resolveFinanceLedgerRowProviderId,
} from "@/lib/admin/finance-ledger-tenant";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
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
    }

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    // All providers with basic info. `providers` has no `owner_name` column — pull the
    // owner's display name from the linked `users` row via user_id (was silently erroring
    // before, which caused the whole providers list to come back empty).
    const { data: providers, error: providersErr } = await supabase
      .from("providers")
      .select(
        "id, business_name, status, rating_average, created_at, user_id, users:user_id(full_name)"
      )
      .eq("tenant_id", tenantId);
    if (providersErr) {
      console.error("[reports/providers] providers select failed", providersErr);
    }

    const providerIds = (providers || []).map((p: { id: string }) => p.id);

    // Bookings in period (count + revenue via completed bookings)
    const { data: bookings } = providerIds.length > 0
      ? await supabase
          .from('bookings')
          .select('provider_id, scheduled_at, total_amount, status')
          .eq('tenant_id', tenantId)
          .in('provider_id', providerIds)
          .gte('scheduled_at', startISO)
          .lte('scheduled_at', endISO)
      : { data: [] };

    const bookingsByProvider: Record<string, { count: number; revenue: number }> = {};
    (bookings || []).forEach((b: { provider_id: string; total_amount?: number; status: string }) => {
      const id = b.provider_id;
      if (!bookingsByProvider[id]) bookingsByProvider[id] = { count: 0, revenue: 0 };
      bookingsByProvider[id].count += 1;
      if (b.status === 'completed' && b.total_amount) {
        bookingsByProvider[id].revenue += Number(b.total_amount);
      }
    });

    // Provider earnings: merged ledger (provider in tenant OR booking in tenant) so booking-only rows count
    const idSet = new Set(providerIds);
    const mergedLedger =
      providerIds.length > 0
        ? await fetchFinanceLedgerExportRowsForTenant(supabase, tenantId, { start: startISO, end: endISO }, {
            transactionTypes: ["provider_earnings", "travel_fee", "tip"],
            restrictProviderIds: providerIds,
          })
        : [];

    const revenueByProvider: Record<string, number> = {};
    for (const row of mergedLedger) {
      const id = resolveFinanceLedgerRowProviderId(row);
      if (!id || !idSet.has(id)) continue;
      if (!revenueByProvider[id]) revenueByProvider[id] = 0;
      revenueByProvider[id] += Number(row.net ?? row.amount ?? 0);
    }

    type ProviderReportRow = {
      id: string;
      business_name?: string;
      status?: string;
      rating_average?: number;
      users?:
        | { full_name?: string | null }
        | Array<{ full_name?: string | null }>
        | null;
    };
    const pickOwner = (u: ProviderReportRow["users"]): string | null => {
      if (!u) return null;
      const row = Array.isArray(u) ? u[0] : u;
      return row?.full_name ?? null;
    };
    const providersWithMetrics = ((providers || []) as unknown as ProviderReportRow[]).map(
      (p) => {
      const bookingsData = bookingsByProvider[p.id] || { count: 0, revenue: 0 };
      const txRevenue = revenueByProvider[p.id] ?? 0;
      return {
        provider_id: p.id,
        provider_name: p.business_name || pickOwner(p.users) || "Unknown",
        status: p.status,
        rating_average: Number(p.rating_average) || 0,
        bookings_count: bookingsData.count,
        revenue: txRevenue > 0 ? txRevenue : bookingsData.revenue,
      };
    }
    );

    const sorted = providersWithMetrics.sort((a, b) => b.revenue - a.revenue);
    const totalProviders = sorted.length;
    const activeCount = sorted.filter((p) => p.status === 'active').length;

    return successResponse({
      period,
      totalProviders,
      activeProviders: activeCount,
      providers: sorted,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load provider report');
  }
}
