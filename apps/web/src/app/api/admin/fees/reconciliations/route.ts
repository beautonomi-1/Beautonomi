import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { computeGatewayFeeSuggestions } from "@/lib/admin/fee-reconciliation-compute";
import { runAutoFeeReconciliation } from "@/lib/admin/auto-fee-reconciliation";

function isTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "");
  return msg.includes("schema cache") || (msg.includes("relation ") && msg.includes("does not exist")) || msg.includes("Could not find the table");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get("gateway");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;
    const autoCompute = searchParams.get("auto_compute") === "true";
    const tenantFilter = searchParams.get("tenant_id") || tenantId;

    let query = supabase
      .from("fee_reconciliations")
      .select("*", { count: "exact" })
      .order("reconciliation_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (tenantFilter) {
      query = query.eq("tenant_id", tenantFilter);
    }
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

    let listData: typeof data = data;
    let listCount = count;
    if (error) {
      if (isTableMissingError(error)) {
        listData = [];
        listCount = 0;
      } else {
        throw error;
      }
    }

    let autoComputedFees: Awaited<ReturnType<typeof computeGatewayFeeSuggestions>> | null = null;
    let autoComputeError: string | null = null;
    if (autoCompute && gateway && startDate && endDate) {
      try {
        autoComputedFees = await computeGatewayFeeSuggestions(
          supabase,
          gateway,
          startDate,
          endDate,
          { tenantId: tenantFilter || null },
        );
      } catch (computeErr) {
        autoComputeError =
          computeErr instanceof Error ? computeErr.message : "Failed to compute fee suggestions";
        console.warn("[fees/reconciliations] auto_compute failed:", computeErr);
      }
    }

    return NextResponse.json({
      data: listData || [],
      meta: {
        page,
        limit,
        total: listCount || 0,
        has_more: (listCount || 0) > offset + limit,
      },
      auto_computed: autoComputedFees,
      auto_compute_error: autoComputeError,
      error: null,
    });
  } catch (error: unknown) {
    console.error("Error fetching reconciliations:", error);
    if (isTableMissingError(error)) {
      return NextResponse.json({
        data: [],
        meta: { page: 1, limit: 50, total: 0, has_more: false },
        auto_computed: null,
        auto_compute_error: null,
        error: null,
      });
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
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const backfill = searchParams.get("backfill") === "true";

    if (backfill) {
      await requireRoleInApi(["superadmin"], request);
      const start = searchParams.get("start");
      const end = searchParams.get("end");
      if (!start || !end) {
        return NextResponse.json(
          { error: "backfill requires start and end query params (YYYY-MM-DD)" },
          { status: 400 },
        );
      }
      const gateway = searchParams.get("gateway") ?? undefined;
      const summary = await runAutoFeeReconciliation(supabase, {
        startDate: start,
        endDate: end,
        tenantIds: tenantId ? [tenantId] : undefined,
        gateways: gateway ? [gateway] : undefined,
      });
      return NextResponse.json({ data: summary, error: null });
    }

    const body = await request.json();
    const {
      reconciliation_date,
      gateway_name,
      expected_fees,
      actual_fees,
      recorded_fees,
      notes,
      statement_reference,
      tenant_id: bodyTenantId,
    } = body;

    if (!reconciliation_date || !gateway_name || expected_fees === undefined || actual_fees === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const variance = actual_fees - expected_fees;
    const recorded =
      recorded_fees !== undefined && recorded_fees !== null
        ? Number(recorded_fees)
        : Number(actual_fees);

    const { data, error } = await supabase
      .from("fee_reconciliations")
      .insert({
        reconciliation_date,
        gateway_name,
        tenant_id: bodyTenantId ?? tenantId ?? null,
        expected_fees,
        actual_fees,
        recorded_fees: recorded,
        variance,
        notes,
        statement_reference,
        source: "manual",
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
