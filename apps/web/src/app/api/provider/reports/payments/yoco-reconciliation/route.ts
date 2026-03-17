import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

export interface YocoReconciliationRow {
  id: string;
  yoco_payment_id: string;
  amount: number;
  currency: string;
  status: string;
  appointment_id: string | null;
  sale_id: string | null;
  created_at: string;
  /** True if this payment is linked to a booking and we have a matching booking_payment */
  booking_synced: boolean;
}

export interface YocoReconciliationResponse {
  payments: YocoReconciliationRow[];
  summary: {
    total: number;
    with_booking: number;
    synced: number;
    not_synced: number;
  };
}

/**
 * GET /api/provider/reports/payments/yoco-reconciliation
 * Lists recent Yoco payments and whether each is synced to booking_payments (for booking-linked payments).
 * Query: from (ISO date), to (ISO date), limit (default 100).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);

    const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = toStr ? new Date(toStr) : new Date();

    const { data: yocoPayments, error: yocoError } = await supabaseAdmin
      .from("provider_yoco_payments")
      .select("id, yoco_payment_id, amount, currency, status, appointment_id, sale_id, created_at")
      .eq("provider_id", providerId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (yocoError) throw yocoError;

    const payments = (yocoPayments || []) as Array<{
      id: string;
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

    let syncedSet = new Set<string>();
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

    const rows: YocoReconciliationRow[] = payments.map((p) => ({
      id: p.id,
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

    const response: YocoReconciliationResponse = {
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
    return handleApiError(error, "yoco-reconciliation");
  }
}
