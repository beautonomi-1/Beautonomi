import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { z } from "zod";

const processRefundSchema = z.object({
  refund_amount: z.number().positive(),
  refund_reason: z.string().min(1),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/refunds/[id]
 * 
 * Get a single refund by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = await params;

    const { data: refund, error } = await supabase
      .from("payment_transactions")
      .select(`
        id,
        booking_id,
        transaction_type,
        amount,
        refund_amount,
        refund_reference,
        refund_reason,
        refunded_at,
        refunded_by,
        status,
        gateway_response,
        created_at,
        updated_at,
        booking:bookings(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name, owner_name, owner_email)
        ),
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `)
      .eq("id", id)
      .single();

    if (error || !refund) {
      return notFoundResponse("Refund not found");
    }

    return successResponse(refund);
  } catch (error) {
    return handleApiError(error, "Failed to fetch refund");
  }
}

/**
 * POST /api/admin/refunds/[id]/process
 * 
 * Process a refund manually
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = await getSupabaseServer();
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const validationResult = processRefundSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify transaction exists
    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("id, booking_id, amount, status, transaction_type")
      .eq("id", id)
      .single();

    if (!transaction) {
      return notFoundResponse("Transaction not found");
    }

    // Check if already refunded
    if (transaction.status === "refunded" || transaction.status === "partially_refunded") {
      return errorResponse(
        "Transaction already refunded",
        "ALREADY_REFUNDED",
        400
      );
    }

    const { refund_amount, refund_reason, notes } = validationResult.data;

    // Validate refund amount doesn't exceed transaction amount
    if (refund_amount > parseFloat(transaction.amount || "0")) {
      return errorResponse(
        "Refund amount cannot exceed transaction amount",
        "INVALID_AMOUNT",
        400
      );
    }

    // Update transaction with refund details
    const updateData: any = {
      refund_amount,
      refund_reason,
      refunded_at: new Date().toISOString(),
      refunded_by: auth.user.id,
      status: refund_amount === parseFloat(transaction.amount || "0") ? "refunded" : "partially_refunded",
    };

    const { data: updatedTransaction, error } = await supabase
      .from("payment_transactions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.refund.process",
      entity_type: "payment_transaction",
      entity_id: id,
      metadata: { refund_amount, refund_reason, notes },
    });

    return successResponse(updatedTransaction);
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
