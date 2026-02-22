import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireRole";
import {
  fetchTransferRecipient,
  updateTransferRecipient,
  deleteTransferRecipient,
  CreateTransferRecipientRequest,
} from "@/lib/payments/paystack-complete";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/paystack/transfer-recipients/[id]
 * Fetch transfer recipient
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const response = await fetchTransferRecipient(id);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error fetching transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to fetch transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/paystack/transfer-recipients/[id]
 * Update transfer recipient
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const updates: Partial<CreateTransferRecipientRequest> = {};

    if (body.name) updates.name = body.name;
    if (body.account_number) updates.account_number = body.account_number;
    if (body.bank_code) updates.bank_code = body.bank_code;
    if (body.description) updates.description = body.description;
    if (body.email) updates.email = body.email;
    if (body.metadata) updates.metadata = body.metadata;

    const response = await updateTransferRecipient(id, updates);

    // Update database
    const supabase = await getSupabaseServer();
    const accountNumber = response.data.details.account_number || "";
    const last4 = accountNumber ? accountNumber.slice(-4) : null;
    await (supabase.from("provider_payout_accounts") as any)
      .update({
        account_number_last4: last4,
        account_name: response.data.details.account_name,
        bank_code: response.data.details.bank_code,
        bank_name: response.data.details.bank_name,
        updated_at: new Date().toISOString(),
      })
      .eq("recipient_code", response.data.recipient_code);

    return NextResponse.json({
      data: response.data,
      error: null,
    });
  } catch (error: any) {
    console.error("Error updating transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to update transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/paystack/transfer-recipients/[id]
 * Delete transfer recipient
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    await deleteTransferRecipient(id);

    // Update database
    const supabase = await getSupabaseServer();
    await (supabase.from("provider_payout_accounts") as any)
      .update({
        active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("recipient_code", id)
      .or(`recipient_id.eq.${id}`);

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: any) {
    console.error("Error deleting transfer recipient:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error.message || "Failed to delete transfer recipient",
          code: "PAYSTACK_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
