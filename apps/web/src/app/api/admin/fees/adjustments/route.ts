import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  fetchBookingInAdminTenant,
  fetchProviderInAdminTenant,
} from "@/lib/tenant/admin-booking-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

function isTableMissingError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" &&
          e !== null &&
          "message" in e &&
          typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : "";
  return (
    msg.includes("schema cache") ||
    (msg.includes("relation ") && msg.includes("does not exist")) ||
    msg.includes("Could not find the table")
  );
}

const ADJUSTMENT_SELECT = `
        *,
        payment_transaction:payment_transaction_id(id, reference, amount, fees, provider),
        finance_transaction:finance_transaction_id(id, transaction_type, amount, fees)
      `;

async function ensurePaymentTransactionInTenant(
  supabase: SupabaseClient,
  paymentTransactionId: string,
  tenantId: string
): Promise<NextResponse | null> {
  const { data: tx } = await supabase
    .from("payment_transactions")
    .select("booking_id, provider_id")
    .eq("id", paymentTransactionId)
    .maybeSingle();
  if (!tx) {
    return notFoundResponse("Payment transaction not found");
  }
  const row = tx as { booking_id?: string | null; provider_id?: string | null };
  if (row.booking_id) {
    const r = await fetchBookingInAdminTenant(supabase, row.booking_id, tenantId, "id");
    return "error" in r ? r.error : null;
  }
  if (row.provider_id) {
    const r = await fetchProviderInAdminTenant(supabase, row.provider_id, tenantId, "id");
    return "error" in r ? r.error : null;
  }
  return notFoundResponse("Payment transaction not found");
}

async function ensureFinanceTransactionInTenant(
  supabase: SupabaseClient,
  financeTransactionId: string,
  tenantId: string
): Promise<NextResponse | null> {
  const { data: ft } = await supabase
    .from("finance_transactions")
    .select("provider_id, booking_id")
    .eq("id", financeTransactionId)
    .maybeSingle();
  const row = ft as { provider_id?: string | null; booking_id?: string | null } | null;
  if (!row) {
    return notFoundResponse("Finance transaction not found");
  }
  if (row.booking_id) {
    const r = await fetchBookingInAdminTenant(supabase, row.booking_id, tenantId, "id");
    return "error" in r ? r.error : null;
  }
  if (row.provider_id) {
    const r = await fetchProviderInAdminTenant(supabase, row.provider_id, tenantId, "id");
    return "error" in r ? r.error : null;
  }
  return notFoundResponse("Finance transaction not found");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({
        data: [],
        meta: { page: 1, limit: 50, total: 0, has_more: false },
        error: null,
      });
    }
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const paymentTransactionId = searchParams.get("payment_transaction_id");
    const financeTransactionId = searchParams.get("finance_transaction_id");
    const reconciled = searchParams.get("reconciled");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    const applyReconciled = <T extends { eq: (a: string, b: boolean) => T }>(q: T) => {
      if (reconciled !== null && reconciled !== "") {
        return q.eq("reconciled", reconciled === "true");
      }
      return q;
    };

    // Single-tx filters: verify tenant, then list (no cross-tenant leakage)
    if (paymentTransactionId) {
      const deny = await ensurePaymentTransactionInTenant(supabase, paymentTransactionId, tenantId);
      if (deny) return deny;
      let query = supabase
        .from("payment_fee_adjustments")
        .select(ADJUSTMENT_SELECT, { count: "exact" })
        .eq("payment_transaction_id", paymentTransactionId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      query = applyReconciled(query);
      const { data, error, count } = await query;
      if (error) {
        if (isTableMissingError(error)) {
          return NextResponse.json({
            data: [],
            meta: { page, limit, total: 0, has_more: false },
            error: null,
          });
        }
        throw error;
      }
      const total = count ?? 0;
      return NextResponse.json({
        data: data || [],
        meta: { page, limit, total, has_more: total > offset + limit },
        error: null,
      });
    }

    if (financeTransactionId) {
      const deny = await ensureFinanceTransactionInTenant(supabase, financeTransactionId, tenantId);
      if (deny) return deny;
      let query = supabase
        .from("payment_fee_adjustments")
        .select(ADJUSTMENT_SELECT, { count: "exact" })
        .eq("finance_transaction_id", financeTransactionId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      query = applyReconciled(query);
      const { data, error, count } = await query;
      if (error) {
        if (isTableMissingError(error)) {
          return NextResponse.json({
            data: [],
            meta: { page, limit, total: 0, has_more: false },
            error: null,
          });
        }
        throw error;
      }
      const total = count ?? 0;
      return NextResponse.json({
        data: data || [],
        meta: { page, limit, total, has_more: total > offset + limit },
        error: null,
      });
    }

    const selectPayBooking = `
        *,
        payment_transaction:payment_transaction_id!inner(id, reference, amount, fees, provider, booking:bookings!inner(tenant_id)),
        finance_transaction:finance_transaction_id(id, transaction_type, amount, fees)
      `;
    const selectPayProviderOnly = `
        *,
        payment_transaction:payment_transaction_id!inner(id, reference, amount, fees, provider, booking_id, providers!inner(tenant_id)),
        finance_transaction:finance_transaction_id(id, transaction_type, amount, fees)
      `;
    const selectFin = `
        *,
        payment_transaction:payment_transaction_id(id, reference, amount, fees, provider),
        finance_transaction:finance_transaction_id!inner(id, transaction_type, amount, fees, providers!inner(tenant_id))
      `;
    const selectFinBooking = `
        *,
        payment_transaction:payment_transaction_id(id, reference, amount, fees, provider),
        finance_transaction:finance_transaction_id!inner(id, transaction_type, amount, fees, bookings!inner(tenant_id))
      `;

    let q1 = supabase
      .from("payment_fee_adjustments")
      .select(selectPayBooking)
      .eq("payment_transaction.booking.tenant_id", tenantId)
      .order("created_at", { ascending: false });
    q1 = applyReconciled(q1);

    let q1b = supabase
      .from("payment_fee_adjustments")
      .select(selectPayProviderOnly)
      .eq("payment_transaction.providers.tenant_id", tenantId)
      .is("payment_transaction.booking_id", null)
      .order("created_at", { ascending: false });
    q1b = applyReconciled(q1b);

    let q2 = supabase
      .from("payment_fee_adjustments")
      .select(selectFin)
      .eq("finance_transaction.providers.tenant_id", tenantId)
      .is("payment_transaction_id", null)
      .order("created_at", { ascending: false });
    q2 = applyReconciled(q2);

    let q2b = supabase
      .from("payment_fee_adjustments")
      .select(selectFinBooking)
      .eq("finance_transaction.bookings.tenant_id", tenantId)
      .is("payment_transaction_id", null)
      .not("finance_transaction_id", "is", null)
      .order("created_at", { ascending: false });
    q2b = applyReconciled(q2b);

    const [r1, r1b, r2, r2b] = await Promise.all([q1, q1b, q2, q2b]);

    if (r1.error && !isTableMissingError(r1.error)) throw r1.error;
    if (r1b.error && !isTableMissingError(r1b.error)) throw r1b.error;
    if (r2.error && !isTableMissingError(r2.error)) throw r2.error;
    if (r2b.error && !isTableMissingError(r2b.error)) throw r2b.error;

    const byId = new Map<string, object>();
    for (const row of (r1.data || []) as object[]) {
      const id = (row as { id: string }).id;
      byId.set(id, row);
    }
    for (const row of (r1b.data || []) as object[]) {
      const id = (row as { id: string }).id;
      byId.set(id, row);
    }
    for (const row of (r2.data || []) as object[]) {
      const id = (row as { id: string }).id;
      byId.set(id, row);
    }
    for (const row of (r2b.data || []) as object[]) {
      const id = (row as { id: string }).id;
      byId.set(id, row);
    }

    const merged = [...byId.values()].sort(
      (a, b) =>
        new Date((b as { created_at: string }).created_at).getTime() -
        new Date((a as { created_at: string }).created_at).getTime()
    );
    const total = merged.length;
    const pageSlice = merged.slice(offset, offset + limit);

    return NextResponse.json({
      data: pageSlice,
      meta: {
        page,
        limit,
        total,
        has_more: total > offset + limit,
      },
      error: null,
    });
  } catch (error: unknown) {
    console.error("Error fetching fee adjustments:", error);
    if (isTableMissingError(error)) {
      return NextResponse.json({
        data: [],
        meta: { page: 1, limit: 50, total: 0, has_more: false },
        error: null,
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch fee adjustments" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }
    const tenantId = await resolveAdminApiTenantId(request);

    const body = await request.json();
    const {
      payment_transaction_id,
      finance_transaction_id,
      original_fee_amount,
      adjusted_fee_amount,
      adjustment_reason,
      adjustment_type,
      notes,
    } = body;

    if (!payment_transaction_id && !finance_transaction_id) {
      return NextResponse.json(
        { error: "Either payment_transaction_id or finance_transaction_id is required" },
        { status: 400 }
      );
    }

    if (
      !original_fee_amount ||
      adjusted_fee_amount === undefined ||
      !adjustment_reason ||
      !adjustment_type
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (payment_transaction_id) {
      const deny = await ensurePaymentTransactionInTenant(
        supabase,
        payment_transaction_id as string,
        tenantId
      );
      if (deny) return deny;
    }
    if (finance_transaction_id) {
      const deny = await ensureFinanceTransactionInTenant(
        supabase,
        finance_transaction_id as string,
        tenantId
      );
      if (deny) return deny;
    }

    let originalFee = original_fee_amount;
    if (payment_transaction_id) {
      const { data: tx } = await supabase
        .from("payment_transactions")
        .select("fees")
        .eq("id", payment_transaction_id as string)
        .maybeSingle();
      if (tx) originalFee = (tx as { fees: number }).fees;
    } else if (finance_transaction_id) {
      const { data: tx } = await supabase
        .from("finance_transactions")
        .select("fees")
        .eq("id", finance_transaction_id as string)
        .maybeSingle();
      if (tx) originalFee = (tx as { fees: number }).fees;
    }

    const { data: adjustment, error: adjustmentError } = await supabase
      .from("payment_fee_adjustments")
      .insert({
        payment_transaction_id: payment_transaction_id || null,
        finance_transaction_id: finance_transaction_id || null,
        original_fee_amount: originalFee,
        adjusted_fee_amount,
        adjustment_reason,
        adjustment_type,
        notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (adjustmentError) throw adjustmentError;

    if (payment_transaction_id) {
      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          fees: adjusted_fee_amount,
          net_amount: () => `amount - ${adjusted_fee_amount}`,
        })
        .eq("id", payment_transaction_id as string);

      if (updateError) {
        console.error("Error updating payment_transaction fee:", updateError);
      }
    } else if (finance_transaction_id) {
      const { error: updateError } = await supabase
        .from("finance_transactions")
        .update({
          fees: adjusted_fee_amount,
          net: () => `amount - ${adjusted_fee_amount} - commission`,
        })
        .eq("id", finance_transaction_id as string);

      if (updateError) {
        console.error("Error updating finance_transaction fee:", updateError);
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.fee.adjustment.create",
      entity_type: "payment_fee_adjustment",
      entity_id: adjustment.id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      reason: adjustment_reason,
      after_json: {
        payment_transaction_id,
        finance_transaction_id,
        original_fee_amount: originalFee,
        adjusted_fee_amount,
        adjustment_type,
      },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return NextResponse.json({ data: adjustment, error: null });
  } catch (error: unknown) {
    console.error("Error creating fee adjustment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create fee adjustment" },
      { status: 500 }
    );
  }
}
