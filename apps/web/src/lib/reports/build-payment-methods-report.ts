/**
 * Provider "payment methods" report: settlement-window aggregates from payment_transactions,
 * plus booking_payments (till / manual) and split-safe wallet portions from bookings — aligned
 * with payment summary dedupe rules (see payments/summary route).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRecordedPaymentMethod } from "@/lib/reports/recorded-takings";

const PT_PAGE = 1000;
const ID_CHUNK = 150;

export function isGatewayCardCaptureProvider(provider: string | null | undefined): boolean {
  const p = (provider || "").toLowerCase();
  return (
    p === "paystack" ||
    p === "paystack_terminal" ||
    p === "paystack_virtual_terminal" ||
    p === "yoco" ||
    p === "paycloud" ||
    p === "stripe" ||
    p === "card"
  );
}

function isInternalWalletGiftSettlementProvider(provider: string | null | undefined): boolean {
  const p = (provider || "").toLowerCase();
  return p === "wallet" || p === "gift_card" || p === "wallet_and_gift_card";
}

export function normalizePtProviderKey(provider: string | null | undefined): string {
  const p = (provider || "unknown").trim().toLowerCase();
  return p || "unknown";
}

export function humanizePaymentMethodKey(key: string): string {
  const k = key.toLowerCase();
  const map: Record<string, string> = {
    paystack: "Paystack",
    paystack_terminal: "Paystack Terminal",
    paystack_virtual_terminal: "Paystack Terminal",
    yoco: "Yoco",
    paycloud: "Card machine (PayCloud)",
    stripe: "Stripe",
    card: "Card (terminal)",
    wallet: "Wallet credit",
    gift_card: "Gift card",
    wallet_and_gift_card: "Wallet & gift card",
    cash: "Cash",
    bank_transfer: "Bank transfer",
    payfast: "PayFast",
    unknown: "Unknown",
    other: "Other",
  };
  if (map[k]) return map[k];
  if (!key) return "Unknown";
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

type BookingScopeRow = { id: string; location_id?: string | null };

async function fetchBookingsForProvider(
  supabase: SupabaseClient,
  providerId: string,
  bookingIds: string[],
  locationId?: string | null,
): Promise<Map<string, BookingScopeRow>> {
  const map = new Map<string, BookingScopeRow>();
  const ids = [...new Set(bookingIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    let q = supabase.from("bookings").select("id, location_id").eq("provider_id", providerId).in("id", slice);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of (data ?? []) as BookingScopeRow[]) {
      if (locationId && row.location_id !== locationId) continue;
      map.set(row.id, row);
    }
  }
  return map;
}

async function fetchPaymentTransactionsForBookings(
  supabase: SupabaseClient,
  bookingIds: string[],
  status: "success" | "failed",
): Promise<Array<{ booking_id: string | null; provider: string; amount: number }>> {
  const out: Array<{ booking_id: string | null; provider: string; amount: number }> = [];
  const ids = [...new Set(bookingIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("booking_id, provider, amount")
      .in("booking_id", slice)
      .eq("status", status);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ booking_id: string | null; provider: string; amount?: number }>) {
      out.push({
        booking_id: row.booking_id,
        provider: row.provider,
        amount: Number(row.amount ?? 0),
      });
    }
  }
  return out;
}

type MutableBucket = {
  methodKey: string;
  ptCount: number;
  ptAmount: number;
  bpCount: number;
  bpAmount: number;
  walletAdjCount: number;
  walletAdjAmount: number;
};

export type PaymentMethodsMethodRow = {
  method: string;
  label: string;
  totalCount: number;
  totalAmount: number;
  paymentTransactionCount: number;
  paymentTransactionAmount: number;
  bookingPaymentCount: number;
  bookingPaymentAmount: number;
  walletBookingAdjustmentCount: number;
  walletBookingAdjustmentAmount: number;
  averageAmount: number;
  percentage: number;
};

export type ProviderPaymentMethodsReportResult = {
  timezone: string;
  fromYmd: string;
  toYmd: string;
  reportBasis: string;
  /** Sum of line-item counts (PT rows + BP rows + conditional wallet booking increments). */
  totalLineItems: number;
  totalAmount: number;
  methods: PaymentMethodsMethodRow[];
  diagnostics: {
    failedCaptureAttemptsInRange: number;
    failedCaptureAttemptsAttributed: number;
  };
};

export async function buildProviderPaymentMethodsReport(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    providerTenantId: string | null;
    locationId?: string | null;
    rangeStartIso: string;
    rangeEndIso: string;
    timezone: string;
    fromYmd: string;
    toYmd: string;
  },
): Promise<ProviderPaymentMethodsReportResult> {
  const { providerId, providerTenantId, locationId, rangeStartIso, rangeEndIso, timezone, fromYmd, toYmd } =
    params;

  const bucketMap = new Map<string, MutableBucket>();

  const getBucket = (methodKey: string): MutableBucket => {
    let b = bucketMap.get(methodKey);
    if (!b) {
      b = {
        methodKey,
        ptCount: 0,
        ptAmount: 0,
        bpCount: 0,
        bpAmount: 0,
        walletAdjCount: 0,
        walletAdjAmount: 0,
      };
      bucketMap.set(methodKey, b);
    }
    return b;
  };

  /** ---------- Successful payment_transactions in settlement window ---------- */
  let offset = 0;
  const scopedPtBookingIds = new Set<string>();

  for (;;) {
    const { data: ptPage, error: ptErr } = await supabase
      .from("payment_transactions")
      .select("provider, amount, booking_id, created_at")
      .eq("status", "success")
      .gte("created_at", rangeStartIso)
      .lte("created_at", rangeEndIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PT_PAGE - 1);

    if (ptErr) throw ptErr;
    const rows = (ptPage ?? []) as Array<{ provider: string; amount?: number; booking_id: string | null }>;
    if (rows.length === 0) break;

    const bookingIds = rows.map((r) => r.booking_id).filter((id): id is string => Boolean(id));
    const bookingScope = await fetchBookingsForProvider(supabase, providerId, bookingIds, locationId);

    for (const pt of rows) {
      if (!pt.booking_id || !bookingScope.has(pt.booking_id)) continue;
      scopedPtBookingIds.add(pt.booking_id);
      const key = normalizePtProviderKey(pt.provider);
      const b = getBucket(key);
      b.ptCount += 1;
      b.ptAmount += Number(pt.amount ?? 0);
    }

    offset += PT_PAGE;
    if (rows.length < PT_PAGE) break;
  }

  /** ---------- booking_payments (till / manual) completed in window ----------
   * Only add a booking_payment if its booking did NOT already have a successful
   * gateway payment_transaction in this window for the same effective method.
   * This prevents double-counting when a webhook flow creates both a PT row and
   * a completed BP row for the same capture (typical Paystack/Yoco flows).
   * Cash / manual BPs on bookings that happened to also have a gateway PT (partial
   * payments) are kept — they represent a different leg of the same booking.
   */
  let bpQuery = supabase
    .from("booking_payments")
    .select("booking_id, amount, payment_method, payment_provider")
    .eq("status", "completed")
    .gte("created_at", rangeStartIso)
    .lte("created_at", rangeEndIso);

  if (providerTenantId) {
    bpQuery = bpQuery.eq("tenant_id", providerTenantId);
  }

  const { data: bpRowsRaw, error: bpErr } = await bpQuery;
  if (bpErr) throw bpErr;

  type BpRow = {
    booking_id: string;
    amount?: number;
    payment_method?: string;
    payment_provider?: string | null;
  };
  const bpList = (bpRowsRaw ?? []) as BpRow[];
  const bpBookingIds = [...new Set(bpList.map((r) => r.booking_id))];
  const bpScope = await fetchBookingsForProvider(supabase, providerId, bpBookingIds, locationId);

  for (const row of bpList) {
    if (!bpScope.has(row.booking_id)) continue;
    // Provider-collected card-machine tenders (PayCloud) store payment_method='card';
    // attribute them to their own bucket via payment_provider so the mix isn't
    // collapsed into generic "Card (terminal)".
    const methodKey =
      (row.payment_provider ?? "").toLowerCase() === "paycloud"
        ? "paycloud"
        : normalizeRecordedPaymentMethod(row.payment_method);
    // Skip if the booking already has a gateway PT that would cover this same
    // payment leg (prevents double-counting gateway captures).
    if (scopedPtBookingIds.has(row.booking_id) && isGatewayCardCaptureProvider(methodKey)) continue;
    const b = getBucket(methodKey);
    b.bpCount += 1;
    b.bpAmount += Number(row.amount ?? 0);
  }

  /** ---------- Wallet booking adjustments (same rules as payment summary) ---------- */
  const unionBookingIds = [...new Set([...scopedPtBookingIds, ...[...bpScope.keys()]])];
  const walletCandidates: Array<{
    id: string;
    wallet_amount?: number;
    total_paid?: number;
    total_amount?: number;
    payment_status?: string | null;
  }> = [];

  if (unionBookingIds.length > 0) {
    for (let i = 0; i < unionBookingIds.length; i += ID_CHUNK) {
      const slice = unionBookingIds.slice(i, i + ID_CHUNK);
      let bq = supabase
        .from("bookings")
        .select("id, wallet_amount, total_paid, total_amount, payment_status")
        .eq("provider_id", providerId)
        .in("id", slice)
        .gt("wallet_amount", 0);
      if (locationId) {
        bq = bq.eq("location_id", locationId);
      }
      const { data: wb, error: wbErr } = await bq;
      if (wbErr) throw wbErr;
      walletCandidates.push(...((wb ?? []) as typeof walletCandidates));
    }
  }

  const allSuccessPtForDedupe =
    unionBookingIds.length > 0
      ? await fetchPaymentTransactionsForBookings(supabase, unionBookingIds, "success")
      : [];

  const walletBucket = getBucket("wallet");
  for (const b of walletCandidates) {
    const hasGatewayPt = allSuccessPtForDedupe.some(
      (pt) => pt.booking_id === b.id && isGatewayCardCaptureProvider(pt.provider),
    );
    const hasInternalSettlementPt = allSuccessPtForDedupe.some((pt) => {
      if (pt.booking_id !== b.id) return false;
      return isInternalWalletGiftSettlementProvider(pt.provider);
    });
    if (hasInternalSettlementPt && !hasGatewayPt) continue;

    if (Number(b.total_paid ?? 0) === 0) {
      walletBucket.walletAdjCount += 1;
    }
    walletBucket.walletAdjAmount += Number(b.wallet_amount ?? 0);
  }

  /** ---------- Failed capture attempts (same settlement window; attributed when booking is in scope) ---------- */
  let failOffset = 0;
  let failedTotalInRange = 0;
  let failedAttributed = 0;

  for (;;) {
    const { data: failPage, error: failErr } = await supabase
      .from("payment_transactions")
      .select("booking_id, provider, amount, created_at")
      .eq("status", "failed")
      .gte("created_at", rangeStartIso)
      .lte("created_at", rangeEndIso)
      .order("created_at", { ascending: true })
      .range(failOffset, failOffset + PT_PAGE - 1);

    if (failErr) throw failErr;
    const frows = (failPage ?? []) as Array<{ booking_id: string | null }>;
    if (frows.length === 0) break;

    failedTotalInRange += frows.length;
    const fbIds = frows.map((r) => r.booking_id).filter((id): id is string => Boolean(id));
    const failScope = await fetchBookingsForProvider(supabase, providerId, fbIds, locationId);
    failedAttributed += frows.filter((r) => r.booking_id && failScope.has(r.booking_id)).length;

    failOffset += PT_PAGE;
    if (frows.length < PT_PAGE) break;
  }

  /** ---------- Final rows ---------- */
  const grandTotal = [...bucketMap.values()].reduce(
    (s, m) => s + m.ptAmount + m.bpAmount + m.walletAdjAmount,
    0,
  );

  const methods: PaymentMethodsMethodRow[] = [...bucketMap.entries()]
    .map(([methodKey, m]) => {
      const totalAmount = m.ptAmount + m.bpAmount + m.walletAdjAmount;
      const totalCount = m.ptCount + m.bpCount + m.walletAdjCount;
      return {
        method: methodKey,
        label: humanizePaymentMethodKey(methodKey),
        totalCount,
        totalAmount,
        paymentTransactionCount: m.ptCount,
        paymentTransactionAmount: m.ptAmount,
        bookingPaymentCount: m.bpCount,
        bookingPaymentAmount: m.bpAmount,
        walletBookingAdjustmentCount: m.walletAdjCount,
        walletBookingAdjustmentAmount: m.walletAdjAmount,
        averageAmount: totalCount > 0 ? totalAmount / totalCount : 0,
        percentage: grandTotal > 0 ? (totalAmount / grandTotal) * 100 : 0,
      };
    })
    .filter((row) => row.totalAmount > 0 || row.totalCount > 0)
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const totalLineItems = methods.reduce((s, m) => s + m.totalCount, 0);

  const reportBasis =
    `Settlement window ${fromYmd}–${toYmd} (${timezone}): amounts are attributed using capture timestamps, not appointment dates. ` +
    `Successful payment_transactions rows count toward the bucket matching their provider (Paystack, Yoco, wallet settlement, etc.). ` +
    `Completed booking_payments in the same window add till- or manually-logged cash, card, bank, and other methods (same normalization as end-of-day recorded takings). ` +
    `Wallet credit from bookings.wallet_amount is added only when it is not already fully represented by an internal wallet/gift_card payment_transaction on the same booking (split Paystack+wallet uses this column for the wallet leg). ` +
    `Failed capture counts are payment_transaction rows with status failed in this window; “attributed” means the row links to a booking at this provider (and location when filtered).`;

  return {
    timezone,
    fromYmd,
    toYmd,
    reportBasis,
    totalLineItems,
    totalAmount: grandTotal,
    methods,
    diagnostics: {
      failedCaptureAttemptsInRange: failedTotalInRange,
      failedCaptureAttemptsAttributed: failedAttributed,
    },
  };
}
