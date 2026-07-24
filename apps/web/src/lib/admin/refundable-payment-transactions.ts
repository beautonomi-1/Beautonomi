import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrphanRefundPaymentTxsForTenant } from "@/lib/admin/payment-transactions-tenant-scope";

export type RefundablePaymentTxRow = {
  id: string;
  amount?: number | string | null;
  currency?: string | null;
  status?: string;
  created_at?: string;
};

/**
 * Successful payment captures that admins can still refund via POST /api/admin/refunds/[id].
 * Includes booking-linked rows for the tenant plus orphan gateway rows attributed via metadata.
 */
export async function countRefundableSuccessPaymentTxsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { count: bookingCount, error } = await supabase
    .from("payment_transactions")
    .select("id, booking:bookings!inner(tenant_id)", { count: "exact", head: true })
    .eq("status", "success")
    .eq("booking.tenant_id", tenantId);

  if (error) {
    console.error("countRefundableSuccessPaymentTxsForTenant booking:", error);
  }

  const orphanRows = await fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
    startDate: null,
    endDate: null,
    status: "success",
    transactionType: null,
  });

  return (bookingCount ?? 0) + orphanRows.length;
}

/**
 * Recent refundable success rows for the admin activity bell (newest first).
 */
export async function fetchRefundableSuccessPaymentTxsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  limit: number,
): Promise<RefundablePaymentTxRow[]> {
  const { data: bookingRows, error } = await supabase
    .from("payment_transactions")
    .select("id, amount, status, created_at, booking:bookings!inner(tenant_id)")
    .eq("status", "success")
    .eq("booking.tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchRefundableSuccessPaymentTxsForTenant booking:", error);
  }

  const orphanRows = await fetchOrphanRefundPaymentTxsForTenant(supabase, tenantId, {
    startDate: null,
    endDate: null,
    status: "success",
    transactionType: null,
  });

  const byId = new Map<string, RefundablePaymentTxRow>();
  for (const row of (bookingRows || []) as RefundablePaymentTxRow[]) {
    byId.set(row.id, row);
  }
  for (const row of orphanRows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        amount: row.amount,
        status: row.status,
        created_at: row.created_at,
      });
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit);
}
