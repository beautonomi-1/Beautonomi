import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/auth-server";

function isTableMissingError(e: unknown): boolean {
  const msg = typeof (e as any)?.message === "string" ? (e as any).message : "";
  return msg.includes("schema cache") || (msg.includes("relation ") && msg.includes("does not exist")) || msg.includes("Could not find the table");
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(["superadmin"]);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get("gateway");
    const status = searchParams.get("status");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

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

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
      error: null,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Error fetching reconciliations:", err);
    if (isTableMissingError(err)) {
      return NextResponse.json({ data: [], meta: { page: 1, limit: 50, total: 0, has_more: false }, error: null });
    }
    return NextResponse.json(
      { error: err?.message || "Failed to fetch reconciliations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
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
  } catch (error: any) {
    console.error("Error creating reconciliation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create reconciliation" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
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
  } catch (error: any) {
    console.error("Error updating reconciliation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update reconciliation" },
      { status: 500 }
    );
  }
}
