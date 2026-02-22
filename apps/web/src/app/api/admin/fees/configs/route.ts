import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

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

    if (error) throw error;

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    console.error("Error fetching fee configs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch fee configs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

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

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    console.error("Error creating fee config:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create fee config" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

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

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    console.error("Error updating fee config:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update fee config" },
      { status: 500 }
    );
  }
}
