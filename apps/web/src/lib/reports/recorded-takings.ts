/**
 * Cash-register style aggregates: booking_payments, wallet portions on bookings,
 * legacy sales, walk-in product_orders, plus ledger tips/cancellation fees for the range.
 * Wallet: adds only the wallet share not already represented in booking_payments (split-safe).
 * Mirrors end-of-day semantics extended to arbitrary UTC bounds (inclusive).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  filterLedgerRowsForLocation,
  filterProductOrdersForLocation,
  summarizeLedgerLocationAttribution,
  type LedgerLocationAttributionSummary,
} from "@/lib/reports/provider-report-utils";
import { PAID_BOOKING_PAYMENT_STATUSES } from "@/lib/payments/booking-payment-status";
import { fetchAllPaged, fetchInIdChunks } from "@/lib/provider-ops/postgrest-unbounded";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";

export const RECORDED_TAKINGS_PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "paystack",
  "paystack_terminal",
  "yoco",
  "paycloud",
  "gift_card",
  "wallet",
  "other",
] as const;

export type RecordedTakingsResult = {
  byPaymentMethod: Record<string, number>;
  bookingPaymentsTotal: number;
  walletTotal: number;
  /** Legacy `sales` rows + walk-in `product_orders` paid in range. */
  salesTotal: number;
  tipsTotal: number;
  /** Card-machine cash-out (PayCloud). Not revenue; tracked for till reconciliation. */
  cashbackTotal: number;
  cancellationFeesTotal: number;
  /** Same formula as end-of-day `total`. */
  totalRecorded: number;
  bookingCount: number;
  /** Legacy sales row count + walk-in paid orders in range. */
  salesCount: number;
  locationAttribution?: LedgerLocationAttributionSummary;
};

export function normalizeRecordedPaymentMethod(m: string | null | undefined): string {
  if (!m) return "other";
  const lower = m.toLowerCase();
  if ((RECORDED_TAKINGS_PAYMENT_METHODS as readonly string[]).includes(lower)) return lower;
  if (lower === "paystack_virtual_terminal") return "paystack_terminal";
  if (lower === "wallet_credit" || lower === "wallet_payment") return "wallet";
  if (lower === "credit_card" || lower === "debit_card") return "card";
  return "other";
}

/**
 * Resolve the takings bucket, preferring the concrete payment_provider so
 * provider-collected card-machine tenders (PayCloud) are attributed distinctly
 * instead of collapsing into the generic `card` bucket. `payment_method` on these
 * rows is constrained to `card`, so the provider is the only distinguishing signal.
 */
export function resolveRecordedTakingsBucket(
  paymentMethod: string | null | undefined,
  paymentProvider: string | null | undefined,
): string {
  const provider = (paymentProvider ?? "").toLowerCase();
  if (provider === "paycloud") return "paycloud";
  return normalizeRecordedPaymentMethod(paymentMethod);
}

/** Card-machine tip rows are counted in tipsTotal via finance_transactions, not booking_payments. */
export function isCardMachineTipBookingPayment(row: {
  payment_provider_data?: unknown;
  payment_provider_id?: string | null;
}): boolean {
  const data = row.payment_provider_data as Record<string, unknown> | null | undefined;
  if (data && String(data.tip ?? "") === "true") return true;
  return String(row.payment_provider_id ?? "").endsWith(":tip");
}

/** Card-machine cashback rows are counted in cashbackTotal via finance_transactions, not booking_payments. */
export function isCardMachineCashbackBookingPayment(row: {
  payment_provider_data?: unknown;
  payment_provider_id?: string | null;
}): boolean {
  const data = row.payment_provider_data as Record<string, unknown> | null | undefined;
  if (data && String(data.cashback ?? "") === "true") return true;
  return String(row.payment_provider_id ?? "").endsWith(":cashback");
}

function emptyMethodMap(): Record<string, number> {
  const byPaymentMethod: Record<string, number> = {};
  RECORDED_TAKINGS_PAYMENT_METHODS.forEach((m) => {
    byPaymentMethod[m] = 0;
  });
  return byPaymentMethod;
}

export function emptyRecordedTakings(): RecordedTakingsResult {
  return {
    byPaymentMethod: emptyMethodMap(),
    bookingPaymentsTotal: 0,
    walletTotal: 0,
    salesTotal: 0,
    tipsTotal: 0,
    cashbackTotal: 0,
    cancellationFeesTotal: 0,
    totalRecorded: 0,
    bookingCount: 0,
    salesCount: 0,
  };
}

export async function getRecordedTakingsForRange(
  supabaseAdmin: SupabaseClient,
  params: {
    providerId: string;
    rangeStartIso: string;
    rangeEndIso: string;
    locationId?: string | null;
  },
): Promise<RecordedTakingsResult> {
  const { providerId, rangeStartIso, rangeEndIso, locationId } = params;

  const { data: providerRow } = await supabaseAdmin
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const providerTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  const byPaymentMethod = emptyMethodMap();

  const bpRows = await fetchAllPaged<{
    booking_id: string;
    amount?: number;
    payment_method?: string;
    payment_provider?: string | null;
    payment_provider_data?: unknown;
    payment_provider_id?: string | null;
  }>(async (from, to) => {
    let bpQuery = supabaseAdmin
      .from("booking_payments")
      .select("id, booking_id, amount, payment_method, payment_provider, payment_provider_data, payment_provider_id")
      .in("status", [...PAID_BOOKING_PAYMENT_STATUSES])
      .gte("created_at", rangeStartIso)
      .lte("created_at", rangeEndIso)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (providerTenantId) {
      bpQuery = bpQuery.eq("tenant_id", providerTenantId);
    }
    const { data, error } = await bpQuery.range(from, to);
    return { data, error };
  }, MAX_FINANCE_TRANSACTIONS);

  type BpRow = {
    booking_id: string;
    amount?: number;
    payment_method?: string;
    payment_provider?: string | null;
    payment_provider_data?: unknown;
    payment_provider_id?: string | null;
  };
  type BookingRow = { id: string; location_id?: string };
  const bpRowList = (bpRows ?? []) as BpRow[];
  const bookingIds = [...new Set(bpRowList.map((r) => r.booking_id))];
  const providerBookingIds = new Set<string>();
  if (bookingIds.length > 0) {
    const bookings = await fetchInIdChunks<BookingRow>(bookingIds, (slice) =>
      supabaseAdmin.from("bookings").select("id, location_id").eq("provider_id", providerId).in("id", slice),
    );
    for (const b of bookings) {
      if (locationId && b.location_id !== locationId) continue;
      providerBookingIds.add(b.id);
    }
  }

  let bookingPaymentsTotal = 0;
  const bpBookingIds = new Set<string>();
  /** Bookings whose online gateway payment already embeds tip in booking_payments.amount. */
  const onlineGatewayTipAlreadyInPayments = new Set<string>();
  for (const row of bpRowList) {
    if (!providerBookingIds.has(row.booking_id)) continue;
    if (isCardMachineTipBookingPayment(row)) continue;
    if (isCardMachineCashbackBookingPayment(row)) continue;
    const amount = Number(row.amount ?? 0);
    const method = resolveRecordedTakingsBucket(row.payment_method, row.payment_provider);
    byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;
    bookingPaymentsTotal += amount;
    bpBookingIds.add(row.booking_id);
    const provider = String(row.payment_provider ?? "").toLowerCase();
    if (provider === "paystack" || provider === "stripe" || provider === "flutterwave") {
      onlineGatewayTipAlreadyInPayments.add(row.booking_id);
    }
  }

  /** Per booking: sum of completed booking_payments in this range (all methods). */
  const bpAmountByBooking = new Map<string, number>();
  for (const row of bpRowList) {
    if (!providerBookingIds.has(row.booking_id)) continue;
    if (isCardMachineTipBookingPayment(row)) continue;
    if (isCardMachineCashbackBookingPayment(row)) continue;
    const a = Number(row.amount ?? 0);
    bpAmountByBooking.set(row.booking_id, (bpAmountByBooking.get(row.booking_id) ?? 0) + a);
  }

  let walletTotal = 0;
  const bookingIdsWithWalletTakings = new Set<string>();
  {
    const walletBookings = await fetchAllPaged<{
      id: string;
      wallet_amount?: number;
      total_paid?: number;
      total_amount?: number;
      payment_status?: string | null;
      location_id?: string;
    }>(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("id, wallet_amount, total_paid, total_amount, payment_status, location_id")
        .eq("provider_id", providerId)
        .gte("scheduled_at", rangeStartIso)
        .lte("scheduled_at", rangeEndIso)
        .gt("wallet_amount", 0)
        .order("scheduled_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }, MAX_FINANCE_TRANSACTIONS);
    for (const wb of walletBookings as {
      id: string;
      wallet_amount?: number;
      total_paid?: number;
      total_amount?: number;
      payment_status?: string | null;
      location_id?: string;
    }[]) {
      if (locationId && wb.location_id !== locationId) continue;
      const walletAmt = Number(wb.wallet_amount ?? 0);
      const bpSum = bpAmountByBooking.get(wb.id) ?? 0;
      const totalPaid = Number(wb.total_paid ?? 0);
      const ps = (wb.payment_status || "").toLowerCase();
      const hasSettledWalletStatus = ps === "paid" || ps === "partially_refunded";
      let collected = totalPaid;
      if (collected <= 0 && hasSettledWalletStatus) {
        collected = Math.max(Number(wb.total_amount ?? 0), walletAmt, bpSum);
      }
      const uncaptured = Math.max(0, collected - bpSum);
      let walletPortion = Math.min(walletAmt, uncaptured);
      if (walletPortion <= 0 && walletAmt > 0 && bpSum === 0 && hasSettledWalletStatus) {
        walletPortion = walletAmt;
      }
      if (walletPortion <= 0) continue;
      byPaymentMethod.wallet = (byPaymentMethod.wallet || 0) + walletPortion;
      walletTotal += walletPortion;
      bookingIdsWithWalletTakings.add(wb.id);
    }
  }

  const bookingCount = new Set<string>([...bpBookingIds, ...bookingIdsWithWalletTakings]).size;

  const salesRows = await fetchAllPaged<{
    total_amount?: number;
    payment_method?: string;
    payment_provider?: string | null;
  }>(async (from, to) => {
    let salesQuery = supabaseAdmin
      .from("sales")
      .select("id, total_amount, payment_method, payment_provider")
      .eq("provider_id", providerId)
      .eq("payment_status", "completed")
      .gte("sale_date", rangeStartIso)
      .lte("sale_date", rangeEndIso)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true });
    if (locationId) {
      salesQuery = salesQuery.eq("location_id", locationId);
    }
    const { data, error } = await salesQuery.range(from, to);
    return { data, error };
  }, MAX_FINANCE_TRANSACTIONS);

  type SalesRow = { total_amount?: number; payment_method?: string; payment_provider?: string | null };
  let salesTotal = 0;
  for (const row of (salesRows ?? []) as SalesRow[]) {
    const amount = Number(row.total_amount ?? 0);
    const method = resolveRecordedTakingsBucket(row.payment_method, row.payment_provider);
    byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;
    salesTotal += amount;
  }
  let salesCount = (salesRows || []).length;

  let productOrderSalesCount = 0;
  {
    const productOrderRows = await fetchAllPaged<{
      id: string;
      total_amount?: number;
      payment_method?: string;
      payment_provider?: string | null;
      fulfillment_type?: string | null;
      collection_location_id?: string | null;
    }>(async (from, to) => {
      let productOrderQuery = supabaseAdmin
        .from("product_orders")
        .select("id, total_amount, payment_method, payment_provider, fulfillment_type, collection_location_id")
        .eq("provider_id", providerId)
        .eq("order_source", "walk_in")
        .eq("payment_status", "paid")
        .gte("paid_at", rangeStartIso)
        .lte("paid_at", rangeEndIso)
        .order("paid_at", { ascending: true })
        .order("id", { ascending: true });
      if (providerTenantId) {
        productOrderQuery = productOrderQuery.eq("tenant_id", providerTenantId);
      }
      const { data, error } = await productOrderQuery.range(from, to);
      return { data, error };
    }, MAX_FINANCE_TRANSACTIONS);
    let walkInOrders = productOrderRows as {
      id: string;
      total_amount?: number;
      payment_method?: string;
      payment_provider?: string | null;
      fulfillment_type?: string | null;
      collection_location_id?: string | null;
    }[];
    if (locationId) {
      walkInOrders = await filterProductOrdersForLocation(supabaseAdmin, providerId, walkInOrders, locationId);
    }
    productOrderSalesCount = walkInOrders.length;
    for (const row of walkInOrders) {
      const amount = Number(row.total_amount ?? 0);
      const method = resolveRecordedTakingsBucket(row.payment_method, row.payment_provider);
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + amount;
      salesTotal += amount;
    }
  }

  salesCount += productOrderSalesCount;

  let tipsTotal = 0;
  let cashbackTotal = 0;
  let cancellationFeesTotal = 0;
  let ledgerLocationAttribution: LedgerLocationAttributionSummary | undefined;
  try {
    const ledgerRowsRaw = await fetchAllPaged<{
      transaction_type: string;
      amount?: number;
      net?: number;
      booking_id?: string | null;
      product_order_id?: string | null;
    }>(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("finance_transactions")
        .select("id, transaction_type, amount, net, booking_id, product_order_id")
        .eq("provider_id", providerId)
        .in("transaction_type", ["tip", "cashback", "cancellation_fee"])
        .gte("created_at", rangeStartIso)
        .lte("created_at", rangeEndIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      return { data, error };
    }, MAX_FINANCE_TRANSACTIONS);
    type LedgerTipCancelRow = {
      transaction_type: string;
      amount?: number;
      net?: number;
      booking_id?: string | null;
      product_order_id?: string | null;
    };
    let ledgerRows = (ledgerRowsRaw ?? []) as LedgerTipCancelRow[];
    ledgerLocationAttribution = summarizeLedgerLocationAttribution(ledgerRows, locationId ?? null);
    if (locationId) {
      ledgerRows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, ledgerRows, locationId);
    }
    for (const r of ledgerRows ?? []) {
      const row = r as {
        transaction_type: string;
        amount?: number;
        net?: number;
        booking_id?: string | null;
      };
      if (row.transaction_type === "tip") {
        // Online Paystack/Stripe/Flutterwave charges already include tip inside
        // booking_payments.amount. Those tips are therefore already in
        // bookingPaymentsTotal — counting the finance tip row again would
        // double-count. Card-machine tips are excluded from bookingPaymentsTotal
        // (isCardMachineTipBookingPayment) so they still belong in tipsTotal.
        if (row.booking_id && onlineGatewayTipAlreadyInPayments.has(row.booking_id)) {
          continue;
        }
        tipsTotal += Math.abs(Number(row.amount ?? row.net ?? 0));
      } else if (row.transaction_type === "cashback") {
        cashbackTotal += Math.abs(Number(row.amount ?? row.net ?? 0));
      } else if (row.transaction_type === "cancellation_fee") {
        cancellationFeesTotal += Number(row.net ?? row.amount ?? 0);
      }
    }
  } catch {
    /* non-critical */
  }

  // Cashback is till cash-out, not recorded takings income — excluded from totalRecorded.
  const totalRecorded =
    bookingPaymentsTotal + walletTotal + salesTotal + tipsTotal + cancellationFeesTotal;

  return {
    byPaymentMethod,
    bookingPaymentsTotal,
    walletTotal,
    salesTotal,
    tipsTotal,
    cashbackTotal,
    cancellationFeesTotal,
    totalRecorded,
    bookingCount,
    salesCount,
    locationAttribution: ledgerLocationAttribution,
  };
}
