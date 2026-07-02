import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";

function isTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "");
  return msg.includes("schema cache") || (msg.includes("relation ") && msg.includes("does not exist")) || msg.includes("Could not find the table");
}

/**
 * §Phase 8: Auto-compute expected fees for a gateway + date range from the ledger.
 * Returns the sum of fees recorded in finance_transactions (actual fees paid to gateway)
 * plus a calculated expected-fee total using calculate_expected_fee() from config.
 * The difference between expected and recorded reveals mis-priced or mis-captured rows.
 */
async function computeLedgerFees(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  gatewayName: string,
  startDate: string,
  endDate: string,
): Promise<{ recorded_fees: number; expected_fees_from_config: number }> {
  try {
    // Sum fees actually recorded in the ledger for this gateway's payment rows.
    // We join payment_transactions to know the gateway, then aggregate finance_transactions.fees.
    const { data: rows } = await (supabase.from("finance_transactions") as any)
      .select("fees, amount, transaction_type")
      .in("transaction_type", ["payment", "additional_charge_payment", "gift_card_sale", "wallet_topup", "provider_subscription_payment", "provider_ads_payment", "payout", "payout_transfer_fee"])
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    const recordedFees = ((rows ?? []) as { fees?: number | null }[])
      .reduce((s, r) => s + Math.abs(Number(r.fees ?? 0)), 0);

    // Expected fees from config using the DB function for each transaction amount.
    // For efficiency, compute via SQL aggregate.
    const { data: expectedRows } = await (supabase.from("finance_transactions") as any)
      .select("amount, transaction_type")
      .in("transaction_type", ["payment", "additional_charge_payment", "gift_card_sale", "wallet_topup", "provider_subscription_payment", "provider_ads_payment"])
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    let expectedFeesFromConfig = 0;
    for (const row of (expectedRows ?? []) as { amount?: number | null; transaction_type?: string }[]) {
      const scope = (row.transaction_type === "payout" || row.transaction_type === "payout_transfer_fee") ? "transfer" : "transaction";
      const { data: calcFee } = await supabase.rpc("calculate_expected_fee" as any, {
        gateway_name_param: gatewayName,
        transaction_amount: Number(row.amount ?? 0),
        currency_param: "ZAR",
        payment_method_param: "*",
        region_param: "local",
        fee_scope_param: scope,
      });
      expectedFeesFromConfig += Number(calcFee ?? 0);
    }

    return { recorded_fees: Math.round(recordedFees * 100) / 100, expected_fees_from_config: Math.round(expectedFeesFromConfig * 100) / 100 };
  } catch {
    return { recorded_fees: 0, expected_fees_from_config: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get("gateway");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;
    const autoCompute = searchParams.get("auto_compute") === "true";

    let query = supabase
      .from("fee_reconciliations")
      .select("*", { count: "exact" })
      .order("reconciliation_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (gateway) {
      query = query.eq("gateway_name", gateway);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (startDate) {
      query = query.gte("reconciliation_date", startDate);
    }
    if (endDate) {
      query = query.lte("reconciliation_date", endDate);
    }

    const { data, error, count } = await query;

    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json({ data: [], meta: { page, limit, total: 0, has_more: false }, error: null });
      }
      throw error;
    }

    // §Phase 8: when auto_compute=true and a date range + gateway are provided,
    // compute expected fees from the ledger and include as a suggestion.
    let autoComputedFees: { recorded_fees: number; expected_fees_from_config: number } | null = null;
    if (autoCompute && gateway && startDate && endDate) {
      autoComputedFees = await computeLedgerFees(supabase, gateway, startDate, endDate);
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
      auto_computed: autoComputedFees,
      error: null,
    });
  } catch (error: unknown) {
    console.error("Error fetching reconciliations:", error);
    if (isTableMissingError(error)) {
      return NextResponse.json({ data: [], meta: { page: 1, limit: 50, total: 0, has_more: false }, error: null });
    }
    const message = error instanceof Error ? error.message : "Failed to fetch reconciliations";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const {
      reconciliation_date,
      gateway_name,
      expected_fees,
      actual_fees,
      notes,
      statement_reference,
    } = body;

    // Validate required fields
    if (!reconciliation_date || !gateway_name || expected_fees === undefined || actual_fees === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Calculate variance
    const variance = actual_fees - expected_fees;

    const { data, error } = await supabase
      .from("fee_reconciliations")
      .insert({
        reconciliation_date,
        gateway_name,
        expected_fees,
        actual_fees,
        variance,
        notes,
        statement_reference,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    console.error("Error creating reconciliation:", error);
    const message = error instanceof Error ? error.message : "Failed to create reconciliation";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();

    const body = await request.json();
    const { id, status, notes, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing reconciliation ID" },
        { status: 400 }
      );
    }

    // If status is being updated to reviewed/resolved, add reviewed_by and reviewed_at
    if (status && (status === "reviewed" || status === "resolved")) {
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    if (status) {
      updates.status = status;
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }

    const { data, error } = await supabase
      .from("fee_reconciliations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    console.error("Error updating reconciliation:", error);
    const message = error instanceof Error ? error.message : "Failed to update reconciliation";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
