import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal row shape for classifying booking_id IS NULL gateway rows into a tenant. */
export type OrphanPaymentTxRow = {
  id: string;
  reference?: string;
  amount?: number;
  fees?: number;
  net_amount?: number;
  status?: string;
  provider?: string;
  created_at?: string;
  booking_id?: string | null;
  metadata?: Record<string, unknown>;
  transaction_type?: string;
  refund_amount?: string | number | null;
  refund_reference?: string | null;
  refund_reason?: string | null;
  refunded_at?: string | null;
  refunded_by?: string | null;
};

export type OrphanPaymentTxTenantScope = {
  giftOrderIds: Set<string>;
  membershipOrderIds: Set<string>;
  tenantProviderIds: Set<string>;
};

export function orphanPaymentTxBelongsToTenant(
  tx: Pick<OrphanPaymentTxRow, "metadata">,
  ctx: OrphanPaymentTxTenantScope,
): boolean {
  const m = tx.metadata;
  if (!m || typeof m.kind !== "string") return false;
  const kind = m.kind;
  if (kind === "gift_card_order" && typeof m.gift_card_order_id === "string") {
    return ctx.giftOrderIds.has(m.gift_card_order_id);
  }
  if (kind === "membership_order" && typeof m.membership_order_id === "string") {
    return ctx.membershipOrderIds.has(m.membership_order_id);
  }
  const pid = typeof m.provider_id === "string" ? m.provider_id : null;
  if (!pid || !ctx.tenantProviderIds.has(pid)) return false;
  return (
    kind === "provider_subscription_order" ||
    kind === "subscription_authorization" ||
    kind === "ads_budget_order"
  );
}

type ScopeDateOpts = {
  startDate: string | null;
  endDate: string | null;
};

/**
 * IDs used to attribute orphan payment_transactions (no booking) to a tenant.
 * Gift/membership filters mirror transaction export (paid rows, optional date on updated_at).
 */
export async function loadOrphanPaymentTxTenantScope(
  supabase: SupabaseClient,
  tenantId: string,
  opts: ScopeDateOpts,
): Promise<OrphanPaymentTxTenantScope> {
  let giftQ = supabase
    .from("gift_card_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "paid");
  if (opts.startDate) giftQ = giftQ.gte("updated_at", opts.startDate);
  if (opts.endDate) giftQ = giftQ.lte("updated_at", opts.endDate);
  const { data: giftRows } = await giftQ;

  let memQ = supabase
    .from("membership_orders")
    .select("id, providers!inner(tenant_id)")
    .eq("providers.tenant_id", tenantId)
    .eq("status", "paid");
  if (opts.startDate) memQ = memQ.gte("updated_at", opts.startDate);
  if (opts.endDate) memQ = memQ.lte("updated_at", opts.endDate);
  const { data: memRows } = await memQ;

  const { data: provRows } = await supabase.from("providers").select("id").eq("tenant_id", tenantId);

  return {
    giftOrderIds: new Set((giftRows || []).map((r: { id: string }) => r.id)),
    membershipOrderIds: new Set((memRows || []).map((r: { id: string }) => r.id)),
    tenantProviderIds: new Set((provRows || []).map((r: { id: string }) => r.id)),
  };
}

const REFUND_ELIGIBLE_OR =
  "transaction_type.eq.refund,refund_amount.not.is.null,status.eq.success";

/**
 * Orphan payment rows for admin refunds list (same tenant rules as CSV export).
 */
export async function fetchOrphanRefundPaymentTxsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  opts: ScopeDateOpts & {
    status: string | null;
    transactionType: string | null;
  },
): Promise<OrphanPaymentTxRow[]> {
  const ctx = await loadOrphanPaymentTxTenantScope(supabase, tenantId, opts);
  if (
    ctx.giftOrderIds.size === 0 &&
    ctx.membershipOrderIds.size === 0 &&
    ctx.tenantProviderIds.size === 0
  ) {
    return [];
  }

  let pq = supabase
    .from("payment_transactions")
    .select(
      `
        id,
        booking_id,
        transaction_type,
        amount,
        refund_amount,
        refund_reference,
        refund_reason,
        refunded_at,
        refunded_by,
        status,
        created_at,
        metadata,
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `,
    )
    .is("booking_id", null)
    .or(REFUND_ELIGIBLE_OR);

  if (opts.status && opts.status !== "all") {
    pq = pq.eq("status", opts.status);
  }
  if (opts.transactionType) {
    pq = pq.eq("transaction_type", opts.transactionType);
  }
  if (opts.startDate) pq = pq.gte("created_at", opts.startDate);
  if (opts.endDate) pq = pq.lte("created_at", opts.endDate);

  const { data: orphans, error } = await pq;
  if (error) {
    console.error("fetchOrphanRefundPaymentTxsForTenant:", error);
    return [];
  }

  return (orphans || []).filter((row) =>
    orphanPaymentTxBelongsToTenant(row as OrphanPaymentTxRow, ctx),
  ) as OrphanPaymentTxRow[];
}

/**
 * Non-booking rows for transaction export (status/date filters only).
 */
export async function fetchNonBookingPaymentTxsForTenantExport(
  supabase: SupabaseClient,
  tenantId: string,
  opts: ScopeDateOpts & { status: string | null },
): Promise<OrphanPaymentTxRow[]> {
  const ctx = await loadOrphanPaymentTxTenantScope(supabase, tenantId, opts);
  if (
    ctx.giftOrderIds.size === 0 &&
    ctx.membershipOrderIds.size === 0 &&
    ctx.tenantProviderIds.size === 0
  ) {
    return [];
  }

  let pq = supabase
    .from("payment_transactions")
    .select(
      "id, reference, amount, fees, net_amount, status, provider, created_at, booking_id, metadata",
    )
    .is("booking_id", null);

  if (opts.status) pq = pq.eq("status", opts.status);
  if (opts.startDate) pq = pq.gte("created_at", opts.startDate);
  if (opts.endDate) pq = pq.lte("created_at", opts.endDate);

  const { data: orphans, error } = await pq;
  if (error) {
    console.error("Non-booking payment_transactions export:", error);
    return [];
  }

  return (orphans || []).filter((row) =>
    orphanPaymentTxBelongsToTenant(row as OrphanPaymentTxRow, ctx),
  ) as OrphanPaymentTxRow[];
}
