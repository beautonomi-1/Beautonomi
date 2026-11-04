import type { SupabaseClient } from "@supabase/supabase-js";

export type MissingLedgerBookingPaymentRow = {
  id: string;
  booking_id: string;
  amount: number | string;
  payment_provider?: string | null;
  payment_provider_id: string | null;
  payment_provider_data?: Record<string, unknown> | null;
  created_at?: string;
  bookings?: {
    id: string;
    status?: string | null;
    tenant_id?: string | null;
    currency?: string | null;
    total_amount?: number | null;
    payment_option?: string | null;
  } | null;
};

type RpcRow = {
  id: string;
  booking_id: string;
  amount: number | string;
  payment_provider?: string | null;
  payment_provider_id?: string | null;
  payment_provider_data?: Record<string, unknown> | null;
  created_at?: string;
  booking_status?: string | null;
  tenant_id?: string | null;
  currency?: string | null;
  total_amount?: number | null;
  payment_option?: string | null;
};

function mapRpcRow(row: RpcRow): MissingLedgerBookingPaymentRow {
  return {
    id: row.id,
    booking_id: row.booking_id,
    amount: row.amount,
    payment_provider: row.payment_provider ?? null,
    payment_provider_id: row.payment_provider_id ?? null,
    payment_provider_data: row.payment_provider_data ?? null,
    created_at: row.created_at,
    bookings: {
      id: row.booking_id,
      status: row.booking_status ?? null,
      tenant_id: row.tenant_id ?? null,
      currency: row.currency ?? null,
      total_amount: row.total_amount ?? null,
      payment_option: row.payment_option ?? null,
    },
  };
}

async function listMissingLedgerFallback(
  supabase: SupabaseClient,
  provider: string,
  beforeIso: string,
  limit: number,
): Promise<MissingLedgerBookingPaymentRow[]> {
  const { data: rows, error } = await supabase
    .from("booking_payments")
    .select(
      "id, booking_id, amount, payment_provider, payment_provider_id, payment_provider_data, created_at, bookings(id, status, tenant_id, currency, total_amount, payment_option)",
    )
    .eq("payment_provider", provider)
    .eq("status", "completed")
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[listMissingOnlineBookingPayments] fallback query failed:", error);
    return [];
  }

  return (rows ?? []).map((raw) => {
    const r = raw as MissingLedgerBookingPaymentRow & {
      bookings?: MissingLedgerBookingPaymentRow["bookings"] | NonNullable<
        MissingLedgerBookingPaymentRow["bookings"]
      >[];
    };
    const bookings = Array.isArray(r.bookings) ? r.bookings[0] ?? null : r.bookings ?? null;
    return { ...r, bookings };
  });
}

/**
 * Completed online booking_payments with no matching finance_transactions.payment row.
 * Uses migration 1038 RPC when available; falls back to the legacy scan.
 */
export async function listMissingOnlineBookingPayments(
  supabase: SupabaseClient,
  provider: "paystack" | "stripe" | "flutterwave",
  beforeIso: string,
  limit: number,
): Promise<MissingLedgerBookingPaymentRow[]> {
  const { data, error } = await supabase.rpc("list_online_booking_payments_missing_ledger", {
    p_provider: provider,
    p_before: beforeIso,
    p_limit: limit,
  });

  if (!error && Array.isArray(data)) {
    return (data as RpcRow[]).map(mapRpcRow);
  }

  if (error) {
    console.warn(
      "[listMissingOnlineBookingPayments] RPC failed, using fallback scan:",
      error.message ?? error,
    );
  }

  return listMissingLedgerFallback(supabase, provider, beforeIso, limit);
}
