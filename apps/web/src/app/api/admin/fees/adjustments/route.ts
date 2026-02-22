import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["superadmin"]);
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const paymentTransactionId = searchParams.get("payment_transaction_id");
    const financeTransactionId = searchParams.get("finance_transaction_id");
    const reconciled = searchParams.get("reconciled");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("payment_fee_adjustments")
      .select(
        `
        *,
        created_by_user:created_by(id, email, full_name),
        reconciled_by_user:reconciled_by(id, email, full_name),
        payment_transaction:payment_transaction_id(id, reference, amount, fees, provider),
        finance_transaction:finance_transaction_id(id, transaction_type, amount, fees)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (paymentTransactionId) {
      query = query.eq("payment_transaction_id", paymentTransactionId);
    }
    if (financeTransactionId) {
      query = query.eq("finance_transaction_id", financeTransactionId);
    }
    if (reconciled !== null) {
      query = query.eq("reconciled", reconciled === "true");
    }

    const { data, error, count } = await query;

    if (error) throw error;

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
  } catch (error: any) {
    console.error("Error fetching fee adjustments:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch fee adjustments" },
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
      payment_transaction_id,
      finance_transaction_id,
      original_fee_amount,
      adjusted_fee_amount,
      adjustment_reason,
      adjustment_type,
      notes,
    } = body;

    // Validate required fields
    if (
      !payment_transaction_id &&
      !finance_transaction_id
    ) {
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
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the original transaction to verify fee
    let originalFee = original_fee_amount;
    if (payment_transaction_id) {
      const { data: tx } = await supabase
        .from("payment_transactions")
        .select("fees")
        .eq("id", payment_transaction_id)
        .single();
      if (tx) originalFee = tx.fees;
    } else if (finance_transaction_id) {
      const { data: tx } = await supabase
        .from("finance_transactions")
        .select("fees")
        .eq("id", finance_transaction_id)
        .single();
      if (tx) originalFee = tx.fees;
    }

    // Create the adjustment
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

    // Update the actual transaction fee
    if (payment_transaction_id) {
      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          fees: adjusted_fee_amount,
          net_amount: () => `amount - ${adjusted_fee_amount}`,
        })
        .eq("id", payment_transaction_id);

      if (updateError) {
        console.error("Error updating payment_transaction fee:", updateError);
        // Don't fail the request, just log it
      }
    } else if (finance_transaction_id) {
      const { error: updateError } = await supabase
        .from("finance_transactions")
        .update({
          fees: adjusted_fee_amount,
          net: () => `amount - ${adjusted_fee_amount} - commission`,
        })
        .eq("id", finance_transaction_id);

      if (updateError) {
        console.error("Error updating finance_transaction fee:", updateError);
        // Don't fail the request, just log it
      }
    }

    return NextResponse.json({ data: adjustment, error: null });
  } catch (error: any) {
    console.error("Error creating fee adjustment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create fee adjustment" },
      { status: 500 }
    );
  }
}
