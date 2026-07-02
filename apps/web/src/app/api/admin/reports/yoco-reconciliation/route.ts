import { NextRequest } from "next/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";

export interface AdminYocoReconciliationRow {
  id: string;
  provider_id: string;
  provider_name?: string;
  yoco_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  appointment_id: string | null;
  sale_id: string | null;
  created_at: string;
  booking_synced: boolean;
}

export interface AdminYocoReconciliationResponse {
  payments: AdminYocoReconciliationRow[];
  summary: {
    total: number;
    with_booking: number;
    synced: number;
    not_synced: number;
  };
}

/**
 * GET /api/admin/reports/yoco-reconciliation
 * Admin-only: list Yoco payments and booking sync status, optionally filtered by provider.
 * Query: provider_id (optional), from (ISO), to (ISO), limit (default 100, max 500).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return handleApiError(new Error("Database unavailable"), "admin-yoco-reconciliation");
    }
    const tenantId = await resolveAdminApiTenantId(request);

    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get("provider_id") || undefined;
    if (providerId) {
      const prov = await fetchProviderInAdminTenant(
        supabaseAdmin,
        providerId,
        tenantId,
        "id, tenant_id"
      );
      if ("error" in prov) {
        return prov.error;
      }
    }

    let scopeProviderIds: string[];
    if (providerId) {
      scopeProviderIds = [providerId];
    } else {
      const { data: tenantProviderRows, error: tenantProvErr } = await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("tenant_id", tenantId);
      if (tenantProvErr) throw tenantProvErr;
      scopeProviderIds = (tenantProviderRows || []).map((r) => (r as { id: string }).id);
      if (scopeProviderIds.length === 0) {
        return successResponse({
          payments: [],
          summary: { total: 0, with_booking: 0, synced: 0, not_synced: 0 },
        });
      }
    }

    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    // The SPA Reports hub only sends `period`, not from/to — respect it here so the
    // Yoco report matches the selected Reports period instead of silently falling back
    // to the last 30 days.
    const period = searchParams.get("period");
    // Allow larger limits; fall back to 500 as default cap for backward compat
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10) || 500, 5000);

    const now = new Date();
    const periodToMs: Record<string, number> = {
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
      "90d": 90 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };

    const from = fromStr
      ? new Date(fromStr)
      : period && periodToMs[period]
        ? new Date(now.getTime() - periodToMs[period])
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = toStr ? new Date(toStr) : now;

    // Paginate Yoco payments past the 1000-row PostgREST cap.
    type YocoPaymentRow = {
      id: string;
      provider_id: string;
      yoco_payment_id: string;
      amount: number;
      currency: string;
      status: string;
      appointment_id: string | null;
    };
    const yocoPayments = await fetchAllLedgerPages<YocoPaymentRow>(
      supabaseAdmin
        .from("provider_yoco_payments")
        .select("id, provider_id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at")
        .in("provider_id", scopeProviderIds)
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false }),
      limit,
    );

    const payments = yocoPayments;

    const withBooking = payments.filter((p) => p.appointment_id);
    const yocoIdsWithBooking = withBooking.map((p) => p.yoco_payment_id);

    const syncedSet = new Set<string>();
    if (yocoIdsWithBooking.length > 0) {
      const { data: bpRows } = await supabaseAdmin
        .from("booking_payments")
        .select("payment_provider_id, bookings!inner(tenant_id)")
        .eq("tenant_id", tenantId)
        .eq("bookings.tenant_id", tenantId)
        .eq("payment_provider", "yoco")
        .in("payment_provider_id", yocoIdsWithBooking);
      for (const r of bpRows || []) {
        const id = (r as { payment_provider_id?: string }).payment_provider_id;
        if (id) syncedSet.add(id);
      }
    }

    const providerIds = [...new Set(payments.map((p) => p.provider_id))];
    const providerNames: Record<string, string> = {};
    if (providerIds.length > 0) {
      const { data: providers } = await supabaseAdmin
        .from("providers")
        .select("id, business_name")
        .eq("tenant_id", tenantId)
        .in("id", providerIds);
      for (const p of providers || []) {
        providerNames[(p as { id: string }).id] = (p as { business_name?: string }).business_name || "—";
      }
    }

    const rows: AdminYocoReconciliationRow[] = payments.map((p) => ({
      id: p.id,
      provider_id: p.provider_id,
      provider_name: providerNames[p.provider_id],
      yoco_payment_id: p.yoco_payment_id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      appointment_id: p.appointment_id,
      sale_id: p.sale_id,
      created_at: p.created_at,
      booking_synced: !!p.appointment_id && syncedSet.has(p.yoco_payment_id),
    }));

    const withBookingCount = rows.filter((r) => r.appointment_id).length;
    const syncedCount = rows.filter((r) => r.booking_synced).length;

    const response: AdminYocoReconciliationResponse = {
      payments: rows,
      summary: {
        total: rows.length,
        with_booking: withBookingCount,
        synced: syncedCount,
        not_synced: withBookingCount - syncedCount,
      },
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "admin-yoco-reconciliation");
  }
}
