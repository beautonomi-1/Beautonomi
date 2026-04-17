import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/** Table/schema cache errors when the table does not exist yet (migration not applied). */
function isTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : (typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "");
  return (
    msg.includes("schema cache") ||
    msg.includes("relation ") && msg.includes("does not exist") ||
    msg.includes("Could not find the table")
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get("gateway");
    const currency = searchParams.get("currency");
    const activeOnly = searchParams.get("active_only") === "true";

    let query = supabase
      .from("payment_gateway_fee_configs")
      .select("*")
      .order("effective_from", { ascending: false });

    if (gateway) {
      query = query.eq("gateway_name", gateway);
    }
    if (currency) {
      query = query.eq("currency", currency);
    }
    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      if (isTableMissingError(error)) {
        return NextResponse.json({ data: [], error: null });
      }
      throw error;
    }

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Error fetching fee configs:", err);
    if (isTableMissingError(err)) {
      return NextResponse.json({ data: [], error: null });
    }
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch fee configs" },
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
      gateway_name,
      fee_type,
      fee_percentage,
      fee_fixed_amount,
      fee_tiered_config,
      currency,
      is_active,
      effective_from,
      effective_until,
      description,
    } = body;

    // Validate required fields
    if (!gateway_name || !fee_type || !currency) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate fee type and corresponding values
    if (fee_type === "percentage" && (!fee_percentage || fee_percentage < 0)) {
      return NextResponse.json(
        { error: "Percentage fee requires a valid fee_percentage" },
        { status: 400 }
      );
    }

    if (fee_type === "fixed" && (!fee_fixed_amount || fee_fixed_amount < 0)) {
      return NextResponse.json(
        { error: "Fixed fee requires a valid fee_fixed_amount" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("payment_gateway_fee_configs")
      .insert({
        gateway_name,
        fee_type,
        fee_percentage: fee_percentage || 0,
        fee_fixed_amount: fee_fixed_amount || 0,
        fee_tiered_config: fee_tiered_config || {},
        currency,
        is_active: is_active !== false,
        effective_from: effective_from || new Date().toISOString(),
        effective_until: effective_until || null,
        description,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.fee_config.create",
      entity_type: "payment_gateway_fee_config",
      entity_id: data.id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      after_json: { gateway_name, fee_type, fee_percentage, fee_fixed_amount, currency },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    console.error("Error creating fee config:", error);
    const message = error instanceof Error ? error.message : "Failed to create fee config";
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing fee config ID" },
        { status: 400 }
      );
    }

    // Add updated_by
    updates.updated_by = user.id;

    const { data, error } = await supabase
      .from("payment_gateway_fee_configs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.fee_config.update",
      entity_type: "payment_gateway_fee_config",
      entity_id: id,
      module: "finance",
      risk_level: "critical",
      retention_tier: "financial",
      status: "succeeded",
      after_json: updates,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: unknown) {
    console.error("Error updating fee config:", error);
    const message = error instanceof Error ? error.message : "Failed to update fee config";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
