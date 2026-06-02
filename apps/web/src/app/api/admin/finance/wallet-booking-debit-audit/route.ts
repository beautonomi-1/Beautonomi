import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/finance/wallet-booking-debit-audit
 *
 * Detects bookings that were recorded as wallet-paid (bookings.wallet_amount > 0
 * and/or a synthetic `wallet_booking:<id>` booking_payments row) but DO NOT have a
 * matching wallet_transactions debit. This is the failure mode where the
 * `wallet_debit_self` RPC silently failed: the booking looks wallet-paid, yet the
 * customer's balance never dropped, no wallet history row exists, and the wallet
 * portion was never collected.
 *
 * The standard wallet-reconciliation endpoint cannot catch this because when the
 * debit never ran, `user_wallets.balance` and the `wallet_transactions` sum stay
 * mutually consistent — the row is simply missing on both sides.
 *
 * Report-only: this endpoint does NOT auto-correct. Remediation (re-charge vs
 * write-off) is a finance decision since funds were under-collected.
 */

interface BookingDebitMismatchRow {
  booking_id: string;
  booking_number: string | null;
  customer_id: string;
  customer_email: string | null;
  customer_full_name: string | null;
  tenant_id: string | null;
  provider_id: string | null;
  payment_status: string | null;
  created_at: string | null;
  /** bookings.wallet_amount — the amount the booking claims was paid by wallet */
  expected_wallet_debit: number;
  /** Net debit actually found in wallet_transactions for this booking (debits - reversals) */
  actual_wallet_debit: number;
  /** expected_wallet_debit - actual_wallet_debit (positive => under-debited) */
  shortfall: number;
  /** True when the customer has a wallet row at all */
  wallet_exists: boolean;
}

type BookingRow = {
  id: string;
  booking_number?: string | null;
  customer_id: string;
  tenant_id?: string | null;
  provider_id?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  wallet_amount?: number | null;
};

type UserRow = { id: string; email?: string | null; full_name?: string | null };

const TOLERANCE = 0.01;
const CHUNK_SIZE = 200;

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return handleApiError(new Error("Unauthorized"), "AUTH_REQUIRED", 401);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    let bookingsQuery = supabase
      .from("bookings")
      .select(
        "id, booking_number, customer_id, tenant_id, provider_id, payment_status, created_at, wallet_amount"
      )
      .gt("wallet_amount", 0)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (tenantId) {
      bookingsQuery = bookingsQuery.eq("tenant_id", tenantId);
    }

    const { data: bookingsData, error: bookingsError } = await bookingsQuery;
    if (bookingsError) throw bookingsError;

    const bookings = (bookingsData ?? []) as BookingRow[];
    if (bookings.length === 0) {
      return successResponse({
        mismatches: [],
        checked: 0,
        total_mismatches: 0,
        total_shortfall: 0,
      });
    }

    const bookingIds = bookings.map((b) => b.id);

    // Net wallet debit per booking from the customer ledger. A debit reduces
    // balance; a reversal credit (release-on-failure uses reference_type
    // 'booking', charge.failed uses 'booking_payment_failed') offsets it.
    const netDebitByBooking = new Map<string, number>();
    for (let i = 0; i < bookingIds.length; i += CHUNK_SIZE) {
      const chunk = bookingIds.slice(i, i + CHUNK_SIZE);
      const { data: txRows, error: txError } = await supabase
        .from("wallet_transactions")
        .select("type, amount, reference_id, reference_type")
        .in("reference_id", chunk)
        .in("reference_type", ["booking", "booking_payment_failed"]);
      if (txError) throw txError;

      for (const tx of (txRows ?? []) as {
        type?: string;
        amount?: number;
        reference_id?: string;
      }[]) {
        if (!tx.reference_id) continue;
        const amt = Number(tx.amount ?? 0);
        const signed = tx.type === "debit" ? amt : -amt;
        netDebitByBooking.set(
          tx.reference_id,
          (netDebitByBooking.get(tx.reference_id) ?? 0) + signed
        );
      }
    }

    // Which customers actually have a wallet row (to flag the auth/never-debited case).
    const customerIds = Array.from(new Set(bookings.map((b) => b.customer_id).filter(Boolean)));
    const walletUserIds = new Set<string>();
    const userMap = new Map<string, UserRow>();
    for (let i = 0; i < customerIds.length; i += CHUNK_SIZE) {
      const chunk = customerIds.slice(i, i + CHUNK_SIZE);
      const { data: wallets } = await supabase
        .from("user_wallets")
        .select("user_id")
        .in("user_id", chunk);
      for (const w of (wallets ?? []) as { user_id?: string }[]) {
        if (w.user_id) walletUserIds.add(w.user_id);
      }
      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", chunk);
      for (const u of (users ?? []) as UserRow[]) {
        if (u.id) userMap.set(u.id, u);
      }
    }

    const mismatches: BookingDebitMismatchRow[] = [];
    let totalShortfall = 0;

    for (const b of bookings) {
      const expected = Number(b.wallet_amount ?? 0);
      const actual = Number((netDebitByBooking.get(b.id) ?? 0).toFixed(2));
      const shortfall = Number((expected - actual).toFixed(2));
      if (shortfall > TOLERANCE) {
        const u = userMap.get(b.customer_id);
        totalShortfall += shortfall;
        mismatches.push({
          booking_id: b.id,
          booking_number: b.booking_number ?? null,
          customer_id: b.customer_id,
          customer_email: u?.email ?? null,
          customer_full_name: u?.full_name ?? null,
          tenant_id: b.tenant_id ?? null,
          provider_id: b.provider_id ?? null,
          payment_status: b.payment_status ?? null,
          created_at: b.created_at ?? null,
          expected_wallet_debit: Number(expected.toFixed(2)),
          actual_wallet_debit: actual,
          shortfall,
          wallet_exists: walletUserIds.has(b.customer_id),
        });
      }
    }

    mismatches.sort((a, b) => b.shortfall - a.shortfall);

    return successResponse({
      mismatches: mismatches.slice(0, 200),
      checked: bookings.length,
      total_mismatches: mismatches.length,
      total_shortfall: Number(totalShortfall.toFixed(2)),
    });
  } catch (error) {
    return handleApiError(error, "Failed to run wallet booking debit audit");
  }
}
