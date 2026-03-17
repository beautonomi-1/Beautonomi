import { NextRequest } from "next/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { createClient } from "@supabase/supabase-js";

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
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get("provider_id") || undefined;
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);

    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = toStr ? new Date(toStr) : new Date();

    let query = supabaseAdmin
      .from("provider_yoco_payments")
      .select("id, provider_id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: yocoPayments, error: yocoError } = await query;

    if (yocoError) throw yocoError;

    const payments = (yocoPayments || []) as Array<{
      id: string;
      provider_id: string;
      yoco_payment_id: string;
      amount: number;
      currency: string;
      status: string;
      appointment_id: string | null;
      sale_id: string | null;
      created_at: string;
    }>;

    const withBooking = payments.filter((p) => p.appointment_id);
    const yocoIdsWithBooking = withBooking.map((p) => p.yoco_payment_id);

    const syncedSet = new Set<string>();
    if (yocoIdsWithBooking.length > 0) {
      const { data: bpRows } = await supabaseAdmin
        .from("booking_payments")
        .select("payment_provider_id")
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
