/**
 * Safety net: booking_payments without matching finance_transactions.payment rows.
 *
 * Runs every 15 minutes (see apps/web/vercel.json). Four passes:
 *  1. Paystack: post the missing ledger via `recordPaystackBookingSettlement` after
 *     verifying the charge with Paystack; refunded/cancelled bookings go to needs_review.
 *  2. Fee patch: payment_transactions posted with fees = 0 and an estimated/manual
 *     fee_source are re-verified and patched with Paystack's real fee (R208 case).
 *  3. Stripe/Flutterwave: log-only — no in-process capture exists, repair goes
 *     through the webhook or the manual repair script.
 *  4. needs_review items are persisted to `reconciliation_exceptions` and an ops
 *     Slack alert fires once per run when any item has been open > 24h.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaystackSecretKey } from "@/lib/payments/paystack-server";
import { recordPaystackBookingSettlement } from "./record-paystack-booking-settlement";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import { tryNotifySlackEvent } from "@/lib/integrations/slack/dispatch";
import { SLACK_EVENT_KEYS } from "@/lib/integrations/slack/event-keys";

export const RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE = "reconcile_online_charge_ledger";
export const BACKFILLED_FEE_SOURCES = ["manual_backfill", "estimate", "estimated"] as const;
const REVIEW_ALERT_AFTER_MS = 24 * 60 * 60 * 1000;
const RECENT_CAPTURE_GRACE_MS = 5 * 60 * 1000;
const PAYSTACK_SCAN_LIMIT = 200;
const OTHER_GATEWAY_SCAN_LIMIT = 200;
const FEE_PATCH_LIMIT = 100;

type BookingPaymentRow = {
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

type PaystackVerifyResponse = {
  status?: boolean;
  data?: {
    status?: string;
    amount?: number;
    fees?: number;
    reference?: string;
  };
};

type PaymentTransactionRow = {
  id: string;
  booking_id?: string | null;
  reference: string;
  amount?: number | string | null;
  fees?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

function eventEnv(): "production" | "staging" | "development" {
  const e = process.env.BEAUTONOMI_SLACK_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV;
  if (e === "development") return "development";
  if (e === "preview" || e === "staging") return "staging";
  return "production";
}

function normaliseBookingPaymentRow(raw: unknown): BookingPaymentRow {
  // PostgREST returns the many-to-one `bookings` join as an object, but the
  // inferred type is an array; normalise both shapes.
  const rawRow = raw as Omit<BookingPaymentRow, "bookings"> & {
    bookings?: BookingPaymentRow["bookings"] | Array<NonNullable<BookingPaymentRow["bookings"]>>;
  };
  return {
    ...rawRow,
    bookings: Array.isArray(rawRow.bookings) ? rawRow.bookings[0] ?? null : rawRow.bookings ?? null,
  };
}

async function bookingHasLedgerForPayment(
  supabase: SupabaseClient,
  bookingId: string,
  sourcePaymentId: string,
): Promise<boolean> {
  const { data: paymentRows } = await supabase
    .from("finance_transactions")
    .select("source_payment_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "payment");

  const rows = (paymentRows ?? []) as Array<{ source_payment_id?: string | null }>;
  if (rows.length === 0) return false;
  if (rows.some((row) => !row.source_payment_id)) return true;
  return rows.some((row) => String(row.source_payment_id) === sourcePaymentId);
}

async function bookingPredatesSourceAttribution(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("finance_transactions")
    .select("source_payment_id")
    .eq("booking_id", bookingId)
    .eq("transaction_type", "payment");
  const rows = (data ?? []) as Array<{ source_payment_id?: string | null }>;
  return rows.some((row) => !row.source_payment_id);
}

async function bookingNeedsReview(
  supabase: SupabaseClient,
  bookingId: string,
  bookingStatus?: string | null,
): Promise<{ needsReview: boolean; reason?: string }> {
  if (bookingStatus && ["cancelled", "no_show"].includes(bookingStatus)) {
    return { needsReview: true, reason: "booking_status" };
  }
  const { count } = await supabase
    .from("booking_refunds")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if ((count ?? 0) > 0) {
    return { needsReview: true, reason: "has_refunds" };
  }
  return { needsReview: false };
}

async function verifyPaystackReference(
  reference: string,
  tenantId: string | null | undefined,
): Promise<PaystackVerifyResponse["data"] | null> {
  try {
    const secretKey = await getPaystackSecretKey({ tenantId: tenantId ?? null });
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const json = (await res.json()) as PaystackVerifyResponse;
    if (!res.ok || !json.status || !json.data) return null;
    return json.data;
  } catch (err) {
    console.error("[reconcile-online-charge-ledger] verify failed:", reference, err);
    return null;
  }
}

function resolveIsDeposit(row: BookingPaymentRow): boolean {
  const data = row.payment_provider_data ?? {};
  const requiresDeposit = Boolean(data.requires_deposit);
  const paymentOption =
    typeof data.payment_option === "string"
      ? data.payment_option
      : row.bookings?.payment_option ?? null;
  return requiresDeposit && paymentOption === "deposit";
}

export type ReconcileNeedsReviewItem = {
  bookingPaymentId: string;
  bookingId: string;
  reason: string;
  tenantId?: string | null;
  currency?: string | null;
  amount?: number;
};

export type ReconcileOnlineChargeLedgerSummary = {
  scanned: number;
  posted: number;
  skipped: number;
  needsReview: ReconcileNeedsReviewItem[];
  feePatched: number;
  /** Stripe/Flutterwave completed payments with no ledger. Logged only; never posted here. */
  otherGatewaysMissing: Array<{ bookingPaymentId: string; bookingId: string; provider: string }>;
  errors: Array<{ bookingPaymentId: string; reason: string }>;
  /** True when the 24h needs_review alert was emitted during this run. */
  reviewAlertSent: boolean;
};

export type ReconcileOnlineChargeLedgerOptions = {
  now?: Date;
};

// ─── Pass 1: Paystack missing ledger ──────────────────────────────────────────

async function reconcilePaystackMissingLedger(
  supabase: SupabaseClient,
  summary: ReconcileOnlineChargeLedgerSummary,
  cutoffIso: string,
): Promise<{ scannedPaymentIds: string[] }> {
  const scannedPaymentIds: string[] = [];

  const { data: rows, error } = await supabase
    .from("booking_payments")
    .select(
      "id, booking_id, amount, payment_provider, payment_provider_id, payment_provider_data, created_at, bookings(id, status, tenant_id, currency, total_amount, payment_option)",
    )
    .eq("payment_provider", "paystack")
    .eq("status", "completed")
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(PAYSTACK_SCAN_LIMIT);

  if (error) {
    console.error("[reconcile-online-charge-ledger] query failed:", error);
    return { scannedPaymentIds };
  }

  for (const raw of rows ?? []) {
    const row = normaliseBookingPaymentRow(raw);
    summary.scanned += 1;
    scannedPaymentIds.push(row.id);

    const reference = row.payment_provider_id?.trim();
    if (!reference) {
      summary.skipped += 1;
      continue;
    }

    if (await bookingPredatesSourceAttribution(supabase, row.booking_id)) {
      summary.skipped += 1;
      continue;
    }

    if (await bookingHasLedgerForPayment(supabase, row.booking_id, row.id)) {
      summary.skipped += 1;
      continue;
    }

    const reviewBase: ReconcileNeedsReviewItem = {
      bookingPaymentId: row.id,
      bookingId: row.booking_id,
      reason: "unknown",
      tenantId: row.bookings?.tenant_id ?? null,
      currency: row.bookings?.currency ?? null,
      amount: Number(row.amount ?? 0),
    };

    const review = await bookingNeedsReview(supabase, row.booking_id, row.bookings?.status);
    if (review.needsReview) {
      summary.needsReview.push({ ...reviewBase, reason: review.reason ?? "unknown" });
      continue;
    }

    const verified = await verifyPaystackReference(reference, row.bookings?.tenant_id);
    if (!verified || verified.status !== "success") {
      summary.needsReview.push({ ...reviewBase, reason: "paystack_not_success" });
      continue;
    }

    const amountMajor =
      typeof verified.amount === "number"
        ? convertFromSmallestUnit(verified.amount)
        : Number(row.amount ?? 0);

    const settlement = await recordPaystackBookingSettlement(supabase, {
      bookingId: row.booking_id,
      reference,
      amountMajor,
      feesSmallestOrMajor: verified.fees ?? 0,
      bookingPaymentId: row.id,
      isDeposit: resolveIsDeposit(row),
      feeSource: "paystack_verify_reconcile",
      metadata: { source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE },
    });

    if (settlement.ok === false) {
      summary.errors.push({ bookingPaymentId: row.id, reason: settlement.reason });
      continue;
    }

    if (settlement.ledger.skipped) {
      summary.skipped += 1;
    } else {
      summary.posted += 1;
    }
  }

  return { scannedPaymentIds };
}

// ─── Pass 2: fee patch for already-posted backfills ───────────────────────────

/**
 * Independent of pass 1: rows that were backfilled (manually or with an estimated
 * fee) already have a ledger, so the "already posted → skip" branch never reaches
 * them. Re-verify with Paystack and patch the real fee onto payment_transactions
 * and the attributed finance_transactions `payment` row.
 */
async function patchBackfilledFees(
  supabase: SupabaseClient,
  summary: ReconcileOnlineChargeLedgerSummary,
  nowIso: string,
): Promise<void> {
  const { data: ptRows, error } = await supabase
    .from("payment_transactions")
    .select("id, booking_id, reference, amount, fees, metadata")
    .eq("provider", "paystack")
    .eq("fees", 0)
    .in("metadata->>fee_source", [...BACKFILLED_FEE_SOURCES])
    .order("created_at", { ascending: true })
    .limit(FEE_PATCH_LIMIT);

  if (error) {
    console.error("[reconcile-online-charge-ledger] fee patch query failed:", error);
    return;
  }

  for (const raw of ptRows ?? []) {
    const pt = raw as PaymentTransactionRow;
    const reference = pt.reference?.trim();
    if (!reference || !pt.booking_id) continue;

    const meta = (pt.metadata ?? {}) as Record<string, unknown>;
    const feeSource = String(meta.fee_source ?? "");
    if (!(BACKFILLED_FEE_SOURCES as readonly string[]).includes(feeSource)) continue;
    if (Number(pt.fees ?? 0) > 0) continue;

    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("tenant_id")
      .eq("id", pt.booking_id)
      .maybeSingle();
    const tenantId = (bookingRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

    const verified = await verifyPaystackReference(reference, tenantId);
    const verifiedFees = Number(verified?.fees ?? 0);
    if (!verified || verified.status !== "success" || verifiedFees <= 0) continue;

    const feesMajor = convertFromSmallestUnit(verifiedFees);
    const amountMajor = Number(pt.amount ?? 0);

    const { error: ptUpdateError } = await supabase
      .from("payment_transactions")
      .update({
        fees: feesMajor,
        net_amount: Math.round((amountMajor - feesMajor) * 100) / 100,
        metadata: {
          ...meta,
          fee_source: "paystack_verify_reconcile",
          fee_source_before_patch: feeSource,
          fee_patched_at: nowIso,
        },
      })
      .eq("id", pt.id);

    if (ptUpdateError) {
      summary.errors.push({ bookingPaymentId: pt.id, reason: "fee_patch_pt_update_failed" });
      continue;
    }

    // finance_transactions carries no reference; the ledger writer attributes the
    // `payment` leg via source_payment_id = booking_payments.id. Resolve it from the
    // booking_payments row that holds this Paystack reference.
    const { data: bp } = await supabase
      .from("booking_payments")
      .select("id")
      .eq("booking_id", pt.booking_id)
      .eq("payment_provider", "paystack")
      .eq("payment_provider_id", reference)
      .maybeSingle();
    const bookingPaymentId = (bp as { id?: string } | null)?.id ?? null;

    if (bookingPaymentId) {
      // `net` on the payment leg is the platform commission and is independent of
      // gateway fees in the writer, so only `fees` is patched here.
      await supabase
        .from("finance_transactions")
        .update({ fees: feesMajor })
        .eq("booking_id", pt.booking_id)
        .eq("transaction_type", "payment")
        .eq("source_payment_id", bookingPaymentId);
    } else {
      console.warn(
        "[reconcile-online-charge-ledger] fee patched on payment_transactions but no booking_payments row for reference; finance_transactions left as-is",
        reference,
      );
    }

    summary.feePatched += 1;
  }
}

// ─── Pass 3: Stripe / Flutterwave log-only ────────────────────────────────────

async function scanOtherGatewaysMissingLedger(
  supabase: SupabaseClient,
  summary: ReconcileOnlineChargeLedgerSummary,
  cutoffIso: string,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("booking_payments")
    .select("id, booking_id, payment_provider, created_at")
    .in("payment_provider", ["stripe", "flutterwave"])
    .eq("status", "completed")
    .lt("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(OTHER_GATEWAY_SCAN_LIMIT);

  if (error) {
    console.error("[reconcile-online-charge-ledger] other gateway query failed:", error);
    return;
  }

  for (const raw of rows ?? []) {
    const row = raw as { id: string; booking_id: string; payment_provider?: string | null };
    if (await bookingPredatesSourceAttribution(supabase, row.booking_id)) continue;
    if (await bookingHasLedgerForPayment(supabase, row.booking_id, row.id)) continue;

    const provider = String(row.payment_provider ?? "unknown");
    summary.otherGatewaysMissing.push({
      bookingPaymentId: row.id,
      bookingId: row.booking_id,
      provider,
    });
    console.warn(
      "[reconcile-online-charge-ledger] missing ledger for non-Paystack gateway (log-only)",
      { provider, bookingPaymentId: row.id, bookingId: row.booking_id },
    );
  }
}

// ─── Pass 4: persist needs_review + 24h alert ─────────────────────────────────

type OpenExceptionRow = {
  id: string;
  external_id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function persistReviewItemsAndAlert(
  supabase: SupabaseClient,
  summary: ReconcileOnlineChargeLedgerSummary,
  scannedPaymentIds: string[],
  now: Date,
): Promise<void> {
  const nowIso = now.toISOString();

  const { data: openRows, error } = await supabase
    .from("reconciliation_exceptions")
    .select("id, external_id, created_at, metadata")
    .eq("psp", "paystack")
    .eq("source", "ledger")
    .eq("status", "open")
    .eq("metadata->>source", RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE);

  if (error) {
    console.error("[reconcile-online-charge-ledger] review queue query failed:", error);
    return;
  }

  const open = (openRows ?? []) as OpenExceptionRow[];
  const openByPaymentId = new Map<string, OpenExceptionRow>();
  for (const row of open) {
    if (row.external_id) openByPaymentId.set(String(row.external_id), row);
  }

  const stillNeedsReview = new Set(summary.needsReview.map((item) => item.bookingPaymentId));

  // Resolve exceptions whose payment was scanned this run and no longer needs review
  // (ledger posted, or the payment no longer qualifies).
  for (const paymentId of scannedPaymentIds) {
    if (stillNeedsReview.has(paymentId)) continue;
    const existing = openByPaymentId.get(paymentId);
    if (!existing) continue;
    await supabase
      .from("reconciliation_exceptions")
      .update({
        status: "matched",
        resolved_at: nowIso,
        metadata: { ...(existing.metadata ?? {}), resolved_by: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE },
      })
      .eq("id", existing.id);
    openByPaymentId.delete(paymentId);
  }

  // Upsert one open exception per needs_review item (dedupe on external_id).
  for (const item of summary.needsReview) {
    const existing = openByPaymentId.get(item.bookingPaymentId);
    if (existing) {
      await supabase
        .from("reconciliation_exceptions")
        .update({
          mismatch_reason: `online_charge_ledger_missing:${item.reason}`,
          metadata: { ...(existing.metadata ?? {}), reason: item.reason, last_seen_at: nowIso },
        })
        .eq("id", existing.id);
      continue;
    }

    if (!item.tenantId) {
      console.warn(
        "[reconcile-online-charge-ledger] needs_review item has no tenant; not persisted",
        item.bookingPaymentId,
      );
      continue;
    }

    const { error: insertError } = await supabase.from("reconciliation_exceptions").insert({
      tenant_id: item.tenantId,
      currency: item.currency?.trim() || "ZAR",
      psp: "paystack",
      source: "ledger",
      external_id: item.bookingPaymentId,
      internal_id: item.bookingId,
      amount: item.amount ?? null,
      status: "open",
      mismatch_reason: `online_charge_ledger_missing:${item.reason}`,
      metadata: {
        source: RECONCILE_ONLINE_CHARGE_LEDGER_SOURCE,
        booking_id: item.bookingId,
        booking_payment_id: item.bookingPaymentId,
        reason: item.reason,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      },
    });
    if (insertError) {
      console.error("[reconcile-online-charge-ledger] review item insert failed:", insertError);
      continue;
    }
    openByPaymentId.set(item.bookingPaymentId, {
      id: "pending",
      external_id: item.bookingPaymentId,
      created_at: nowIso,
    });
  }

  const staleThreshold = now.getTime() - REVIEW_ALERT_AFTER_MS;
  const stale = Array.from(openByPaymentId.values()).filter((row) => {
    const created = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    return Number.isFinite(created) && created <= staleThreshold;
  });

  if (stale.length === 0) return;

  const dayKey = nowIso.slice(0, 10);
  try {
    await tryNotifySlackEvent({
      tenantId: "platform",
      environment: eventEnv(),
      eventKey: SLACK_EVENT_KEYS.FINANCE_RECONCILIATION_WARNING,
      dedupeKey: `reconcile-online-charge-ledger:needs_review:${dayKey}`,
      entityType: "cron_job",
      entityId: "reconcile-online-charge-ledger",
      title: "Online charge ledger: payments awaiting review > 24h",
      detailLines: [
        `Open review items older than 24h: ${stale.length}`,
        `Total open review items: ${openByPaymentId.size}`,
        `Sample booking_payments: ${stale
          .slice(0, 5)
          .map((row) => String(row.external_id ?? "?"))
          .join(", ")}`,
        "Action: inspect reconciliation_exceptions (metadata.source = reconcile_online_charge_ledger); repair via scripts/repair-missing-online-charge-ledger.sql or mark written_off.",
      ],
      actionUrl: "/finance",
    });
    summary.reviewAlertSent = true;
  } catch (err) {
    console.error("[reconcile-online-charge-ledger] review alert failed:", err);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function reconcileOnlineChargeLedger(
  supabase: SupabaseClient,
  options: ReconcileOnlineChargeLedgerOptions = {},
): Promise<ReconcileOnlineChargeLedgerSummary> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - RECENT_CAPTURE_GRACE_MS).toISOString();

  const summary: ReconcileOnlineChargeLedgerSummary = {
    scanned: 0,
    posted: 0,
    skipped: 0,
    needsReview: [],
    feePatched: 0,
    otherGatewaysMissing: [],
    errors: [],
    reviewAlertSent: false,
  };

  const { scannedPaymentIds } = await reconcilePaystackMissingLedger(supabase, summary, cutoffIso);

  try {
    await patchBackfilledFees(supabase, summary, nowIso);
  } catch (err) {
    console.error("[reconcile-online-charge-ledger] fee patch pass failed:", err);
  }

  try {
    await scanOtherGatewaysMissingLedger(supabase, summary, cutoffIso);
  } catch (err) {
    console.error("[reconcile-online-charge-ledger] other gateway pass failed:", err);
  }

  try {
    await persistReviewItemsAndAlert(supabase, summary, scannedPaymentIds, now);
  } catch (err) {
    console.error("[reconcile-online-charge-ledger] review persistence failed:", err);
  }

  if (summary.needsReview.length > 0) {
    console.warn("[reconcile-online-charge-ledger] needs_review", summary.needsReview.length);
  }

  return summary;
}
