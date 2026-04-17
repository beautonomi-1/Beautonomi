import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";

/** Payment method key used in response (normalized from booking_payments, bookings.wallet_amount, and sales). */
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "paystack", "yoco", "gift_card", "wallet", "other"] as const;

export interface EndOfDayResponse {
  date: string;
  byPaymentMethod: Record<string, number>;
  bookingPaymentsTotal: number;
  walletTotal: number;
  salesTotal: number;
  tipsTotal: number;
  cancellationFeesTotal: number;
  total: number;
  bookingCount: number;
  salesCount: number;
  note: string;
}

/**
 * GET /api/provider/reports/end-of-day
 * Aggregates takings by payment method for a single day from booking_payments and sales.
 * Query: date (YYYY-MM-DD), location_id (optional).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: providerRow } = await supabaseAdmin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const providerTenantId =
      (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const locationId = searchParams.get("location_id") || undefined;

    if (!dateStr) {
      return errorResponse("Query parameter 'date' (YYYY-MM-DD) is required", "VALIDATION_ERROR", 400);
    }
    const date = new Date(dateStr + "T00:00:00Z");
    if (isNaN(date.getTime())) {
      return errorResponse("Invalid date format. Use YYYY-MM-DD.", "VALIDATION_ERROR", 400);
    }
    const dayStart = date.toISOString();
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const dayEndISO = dayEnd.toISOString();

    const byPaymentMethod: Record<string, number> = {};
    PAYMENT_METHODS.forEach((m) => (byPaymentMethod[m] = 0));

    // Booking payments: scope by tenant when known, then filter by provider via bookings
    let bpQuery = supabaseAdmin
      .from("booking_payments")
      .select("booking_id, amount, payment_method")
      .eq("status", "completed")
      .gte("created_at", dayStart)
      .lt("created_at", dayEndISO);
    if (providerTenantId) {
      bpQuery = bpQuery.eq("tenant_id", providerTenantId);
    }
    const { data: bpRows, error: bpError } = await bpQuery;

    if (bpError) throw bpError;

    type BpRow = { booking_id: string; amount?: number; payment_method?: string };
    type BookingRow = { id: string; location_id?: string };
    const bpRowList = (bpRows ?? []) as BpRow[];
    const bookingIds = [...new Set(bpRowList.map((r) => r.booking_id))];
    const providerBookingIds = new Set<string>();
    if (bookingIds.length > 0) {
      const { data: bookings, error: bookError } = await supabaseAdmin
        .from("bookings")
        .select("id, location_id")
        .eq("provider_id", providerId)
        .in("id", bookingIds);
      if (!bookError && bookings) {
        for (const b of bookings as BookingRow[]) {
          if (locationId && b.location_id !== locationId) continue;
          providerBookingIds.add(b.id);
        }
      }
    }

    let bookingPaymentsTotal = 0;
    const bpBookingIds = new Set<string>();
    for (const row of bpRowList) {
      if (!providerBookingIds.has(row.booking_id)) continue;
      const amount = Number(row.amount ?? 0);
      const method = normalizePaymentMethod(row.payment_method);
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;
      bookingPaymentsTotal += amount;
      bpBookingIds.add(row.booking_id);
    }

    // Wallet-only bookings — query independently so days with zero booking_payments
    // still capture wallet-settled bookings.
    let walletTotal = 0;
    const walletOnlyBookingIds = new Set<string>();
    {
      const { data: walletBookings } = await supabaseAdmin
        .from("bookings")
        .select("id, wallet_amount, location_id")
        .eq("provider_id", providerId)
        .gte("scheduled_at", dayStart)
        .lt("scheduled_at", dayEndISO)
        .gt("wallet_amount", 0);
      for (const wb of (walletBookings ?? []) as { id: string; wallet_amount?: number; location_id?: string }[]) {
        if (bpBookingIds.has(wb.id)) continue;
        if (locationId && wb.location_id !== locationId) continue;
        const walletAmt = Number(wb.wallet_amount ?? 0);
        byPaymentMethod["wallet"] = (byPaymentMethod["wallet"] || 0) + walletAmt;
        walletTotal += walletAmt;
        walletOnlyBookingIds.add(wb.id);
      }
    }

    const bookingCount = bpBookingIds.size + walletOnlyBookingIds.size;

    // Sales: provider_id, optional location_id, sale_date in day
    let salesQuery = supabaseAdmin
      .from("sales")
      .select("total_amount, payment_method")
      .eq("provider_id", providerId)
      .eq("payment_status", "completed")
      .gte("sale_date", dayStart)
      .lt("sale_date", dayEndISO);

    if (locationId) {
      salesQuery = salesQuery.eq("location_id", locationId);
    }
    const { data: salesRows, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    type SalesRow = { total_amount?: number; payment_method?: string };
    let salesTotal = 0;
    for (const row of (salesRows ?? []) as SalesRow[]) {
      const amount = Number(row.total_amount ?? 0);
      const method = normalizePaymentMethod(row.payment_method);
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;
      salesTotal += amount;
    }
    const salesCount = (salesRows || []).length;

    // Ledger-based tips and cancellation fees for the day
    let tipsTotal = 0;
    let cancellationFeesTotal = 0;
    try {
      const { data: ledgerRows } = await supabaseAdmin
        .from("finance_transactions")
        .select("transaction_type, amount, net")
        .eq("provider_id", providerId)
        .in("transaction_type", ["tip", "cancellation_fee"])
        .gte("created_at", dayStart)
        .lt("created_at", dayEndISO);
      for (const r of ledgerRows ?? []) {
        const row = r as { transaction_type: string; amount?: number; net?: number };
        if (row.transaction_type === "tip") {
          tipsTotal += Math.abs(Number(row.amount ?? row.net ?? 0));
        } else if (row.transaction_type === "cancellation_fee") {
          cancellationFeesTotal += Number(row.net ?? row.amount ?? 0);
        }
      }
    } catch { /* non-critical — report still works without ledger extras */ }

    const total = bookingPaymentsTotal + walletTotal + salesTotal + tipsTotal + cancellationFeesTotal;

    const response: EndOfDayResponse = {
      date: dateStr,
      byPaymentMethod,
      bookingPaymentsTotal,
      walletTotal,
      salesTotal,
      tipsTotal,
      cancellationFeesTotal,
      total,
      bookingCount,
      salesCount,
      note: "Cash-register style: sums booking_payments, sales, tips, and cancellation fees by payment date. For ledger-based revenue, use the payments report.",
    };

    return successResponse(response);
  } catch (error) {
    return handleApiError(error, "Failed to generate end-of-day report");
  }
}

function normalizePaymentMethod(m: string | null): string {
  if (!m) return "other";
  const lower = m.toLowerCase();
  if ((PAYMENT_METHODS as readonly string[]).includes(lower)) return lower;
  // Aliases
  if (lower === "bank_transfer") return "bank_transfer";
  if (lower === "wallet_credit" || lower === "wallet_payment") return "wallet";
  if (lower === "credit_card" || lower === "debit_card") return "card";
  return "other";
}
