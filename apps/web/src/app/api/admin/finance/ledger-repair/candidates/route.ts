import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const ONLINE_PROVIDERS = new Set(["paystack", "stripe", "flutterwave"]);

type BookingPaymentRow = {
  id: string;
  booking_id: string;
  amount: number | string;
  payment_provider: string | null;
  payment_provider_id: string | null;
  payment_provider_data?: Record<string, unknown> | null;
  created_at: string;
  bookings?:
    | { id: string; status?: string | null; tenant_id?: string | null; total_amount?: number | null; payment_option?: string | null; booking_number?: string | null; provider_id?: string | null }
    | Array<{ id: string; status?: string | null; tenant_id?: string | null; total_amount?: number | null; payment_option?: string | null; booking_number?: string | null; provider_id?: string | null }>
    | null;
};

function resolveIsDeposit(row: BookingPaymentRow, paymentOption: string | null): boolean {
  const data = row.payment_provider_data ?? {};
  const requiresDeposit = Boolean(data.requires_deposit);
  const option = typeof data.payment_option === "string" ? data.payment_option : paymentOption;
  return requiresDeposit && option === "deposit";
}

/**
 * GET /api/admin/finance/ledger-repair/candidates
 * Read-only: completed online booking_payments (older than 5 min) that have no
 * finance_transactions.payment row attributed to them. Same shape as the
 * reconcile-online-charge-ledger cron, without the Paystack verify/post step.
 *
 * Query: provider (paystack|stripe|flutterwave|all, default paystack), limit (<=200)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const providerParam = (searchParams.get("provider") || "paystack").toLowerCase();
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "200", 10)));

    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let query = supabase
      .from("booking_payments")
      .select(
        "id, booking_id, amount, payment_provider, payment_provider_id, payment_provider_data, created_at, bookings(id, status, tenant_id, total_amount, payment_option, booking_number, provider_id)",
      )
      .eq("status", "completed")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (providerParam !== "all") {
      query = query.eq("payment_provider", ONLINE_PROVIDERS.has(providerParam) ? providerParam : "paystack");
    } else {
      query = query.in("payment_provider", [...ONLINE_PROVIDERS]);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const payments = ((rows ?? []) as unknown as BookingPaymentRow[])
      .map((raw) => ({
        ...raw,
        booking: Array.isArray(raw.bookings) ? raw.bookings[0] ?? null : raw.bookings ?? null,
      }))
      .filter((p) => !p.booking?.tenant_id || String(p.booking.tenant_id) === tenantId);

    if (payments.length === 0) {
      return successResponse({ candidates: [], scanned: 0, cutoff });
    }

    const bookingIds = [...new Set(payments.map((p) => p.booking_id))];
    const { data: ledgerRows } = await supabase
      .from("finance_transactions")
      .select("booking_id, source_payment_id")
      .in("booking_id", bookingIds)
      .eq("transaction_type", "payment");

    const attributed = new Set<string>();
    const legacyBookings = new Set<string>();
    for (const r of (ledgerRows ?? []) as Array<{ booking_id: string; source_payment_id?: string | null }>) {
      if (r.source_payment_id) attributed.add(String(r.source_payment_id));
      else legacyBookings.add(String(r.booking_id));
    }

    const missing = payments.filter((p) => !attributed.has(p.id) && !legacyBookings.has(p.booking_id));
    if (missing.length === 0) {
      return successResponse({ candidates: [], scanned: payments.length, cutoff });
    }

    const missingBookingIds = [...new Set(missing.map((p) => p.booking_id))];
    const { data: refundRows } = await supabase
      .from("booking_refunds")
      .select("booking_id")
      .in("booking_id", missingBookingIds);
    const bookingsWithRefunds = new Set(
      ((refundRows ?? []) as Array<{ booking_id: string }>).map((r) => String(r.booking_id)),
    );

    const { data: openProposals } = await supabase
      .from("ledger_repair_proposals")
      .select("id, status, payload")
      .eq("kind", "missing_online_charge_ledger")
      .in("status", ["proposed", "approved"])
      .in(
        "payload->>bookingPaymentId",
        missing.map((p) => p.id),
      );
    const proposalByPaymentId = new Map<string, { id: string; status: string }>();
    for (const p of (openProposals ?? []) as Array<{ id: string; status: string; payload: Record<string, unknown> }>) {
      const bpId = p.payload?.bookingPaymentId;
      if (typeof bpId === "string") proposalByPaymentId.set(bpId, { id: p.id, status: p.status });
    }

    const candidates = missing.map((p) => {
      const bookingStatus = p.booking?.status ?? null;
      const reasons: string[] = [];
      if (bookingStatus && ["cancelled", "no_show"].includes(bookingStatus)) reasons.push("booking_status");
      if (bookingsWithRefunds.has(p.booking_id)) reasons.push("has_refunds");
      if (!p.payment_provider_id) reasons.push("missing_reference");
      if (p.payment_provider !== "paystack") reasons.push("non_paystack_manual_only");
      const data = p.payment_provider_data ?? {};
      const feesRaw = typeof data.fees === "number" ? data.fees : null;
      return {
        booking_payment_id: p.id,
        booking_id: p.booking_id,
        booking_number: p.booking?.booking_number ?? null,
        booking_status: bookingStatus,
        provider_id: p.booking?.provider_id ?? null,
        payment_provider: p.payment_provider,
        reference: p.payment_provider_id,
        amount: Number(p.amount ?? 0),
        booking_total: p.booking?.total_amount ?? null,
        /** Paystack stores fees in kobo/cents in payment_provider_data when present. */
        fees_hint_major: feesRaw != null ? Math.round(feesRaw) / 100 : null,
        is_deposit: resolveIsDeposit(p, p.booking?.payment_option ?? null),
        created_at: p.created_at,
        needs_review: reasons.length > 0,
        review_reasons: reasons,
        open_proposal: proposalByPaymentId.get(p.id) ?? null,
      };
    });

    return successResponse({ candidates, scanned: payments.length, cutoff });
  } catch (error) {
    return handleApiError(error, "Failed to load ledger repair candidates");
  }
}
