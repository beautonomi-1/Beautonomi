import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subDays } from "date-fns";

/**
 * GET /api/provider/reports/payments/methods
 *
 * Payment method breakdown for the provider portal.
 *
 * Data sources:
 * - `payment_transactions` (status "success"): all settled Paystack, wallet, gift card, Yoco
 * - `bookings` (wallet_amount): wallet-only bookings that have no payment_transaction row
 *
 * Previously used the `payments` table with `status = "completed"` — but the Paystack webhook
 * sets payments.status to "paid" (not "completed"), so Paystack rows were silently excluded.
 * payment_transactions is the correct source of truth for settled charges.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
    const locationId = searchParams.get("location_id") || undefined;

    // Get bookings in the period
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, wallet_amount, total_amount")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings } = await bookingsQuery;

    const bookingIds = (bookings ?? []).map((b) => b.id);

    // Get settled payment_transactions for these bookings
    let ptRows: Array<{ provider: string; amount: number; net_amount: number; status: string; booking_id: string }> = [];
    if (bookingIds.length > 0) {
      const { data: pt } = await supabaseAdmin
        .from("payment_transactions")
        .select("provider, amount, net_amount, status, booking_id")
        .in("booking_id", bookingIds)
        .eq("status", "success");
      ptRows = (pt ?? []) as typeof ptRows;
    }

    type MethodBucket = {
      method: string;
      totalCount: number;
      successfulCount: number;
      failedCount: number;
      totalAmount: number;
      successfulAmount: number;
      failedAmount: number;
      averageAmount: number;
    };

    const methodMap = new Map<string, MethodBucket>();

    const getOrCreate = (method: string): MethodBucket => {
      if (!methodMap.has(method)) {
        methodMap.set(method, {
          method,
          totalCount: 0,
          successfulCount: 0,
          failedCount: 0,
          totalAmount: 0,
          successfulAmount: 0,
          failedAmount: 0,
          averageAmount: 0,
        });
      }
      return methodMap.get(method)!;
    };

    // Count payment_transactions (all "success" status = settled)
    ptRows.forEach((pt) => {
      const method = pt.provider || "unknown";
      const bucket = getOrCreate(method);
      bucket.totalCount += 1;
      bucket.successfulCount += 1;
      bucket.totalAmount += Number(pt.amount ?? 0);
      bucket.successfulAmount += Number(pt.amount ?? 0);
    });

    // Add wallet-only bookings (no payment_transaction row, wallet_amount covers total)
    // These are bookings where wallet covered 100% (no card leg at all)
    const ptBookingIds = new Set(ptRows.map((r) => r.booking_id));
    (bookings ?? []).forEach((b) => {
      const walletAmt = Number(b.wallet_amount ?? 0);
      if (walletAmt > 0 && !ptBookingIds.has(b.id)) {
        const bucket = getOrCreate("wallet");
        bucket.totalCount += 1;
        bucket.successfulCount += 1;
        bucket.totalAmount += walletAmt;
        bucket.successfulAmount += walletAmt;
      }
    });

    const grandTotal = [...methodMap.values()].reduce((s, m) => s + m.totalAmount, 0);

    const methods = [...methodMap.values()]
      .map((m) => ({
        ...m,
        averageAmount: m.totalCount > 0 ? m.totalAmount / m.totalCount : 0,
        successRate: m.totalCount > 0 ? (m.successfulCount / m.totalCount) * 100 : 0,
        percentage: grandTotal > 0 ? (m.totalAmount / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return successResponse({
      totalPayments: methods.reduce((s, m) => s + m.totalCount, 0),
      totalAmount: grandTotal,
      methods,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load payment methods report");
  }
}
