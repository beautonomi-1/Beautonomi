import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { issueAdminWalletRefund } from "@/lib/finance/issue-admin-wallet-refund";
import { z } from "zod";

const processRefundSchema = z.object({
  refund_amount: z.number().positive(),
  refund_reason: z.string().min(1),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/refunds/[id]
 *
 * Get a single refund (payment_transaction) by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
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
        created_at,
        booking:bookings!inner(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          tenant_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name)
        ),
        refunded_by_user:users!payment_transactions_refunded_by_fkey(id, full_name, email)
      `)
      .eq("id", id)
      .eq("booking.tenant_id", tenantId)
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
 * POST /api/admin/refunds/[id]
 *
 * Process a refund for a specific payment_transaction.
 * Credits the customer's wallet via `wallet_credit_admin` and updates the
 * payment_transactions row to refunded/partially_refunded.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { id } = await params;
    const body = await request.json();

    const validationResult = processRefundSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const { refund_amount, refund_reason, notes } = validationResult.data;

    // Fetch and validate the transaction. Allow `partially_refunded` so admins
    // can refund a remaining balance after a prior partial refund.
    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("id, booking_id, amount, status, transaction_type, refund_amount")
      .eq("id", id)
      .single();

    if (!transaction) {
      return notFoundResponse("Transaction not found");
    }

    if (
      transaction.status !== "success" &&
      transaction.status !== "partially_refunded"
    ) {
      const statusMsg =
        transaction.status === "refunded"
          ? "Transaction already refunded"
          : `Cannot refund a transaction with status "${transaction.status}"`;
      return errorResponse(statusMsg, "INVALID_STATUS", 400);
    }

    const txnAmount = parseFloat(String(transaction.amount || "0"));
    const alreadyRefunded = Math.max(
      0,
      parseFloat(String(transaction.refund_amount || "0")),
    );
    const remainingRefundable = Math.round((txnAmount - alreadyRefunded) * 100) / 100;
    if (remainingRefundable <= 0) {
      return errorResponse("Transaction already fully refunded", "INVALID_STATUS", 400);
    }
    if (refund_amount > remainingRefundable + 0.001) {
      return errorResponse(
        "Refund amount cannot exceed remaining refundable amount",
        "INVALID_AMOUNT",
        400,
      );
    }

    // Verify the booking belongs to this tenant
    const loaded = await fetchBookingInAdminTenant(
      supabase,
      transaction.booking_id,
      tenantId,
      "id, tenant_id"
    );
    if ("error" in loaded) return loaded.error;

    const outcome = await issueAdminWalletRefund({
      supabase,
      tenantId,
      bookingId: transaction.booking_id,
      amount: refund_amount,
      originalChargeAmount: txnAmount,
      priorRefundAmount: alreadyRefunded,
      reason: refund_reason,
      actorUserId: user.id,
      actorRole: user.role ?? "superadmin",
      notes: notes ?? null,
      transactionId: id,
    });

    if (outcome.success === false) {
      return errorResponse(outcome.error, outcome.code, outcome.httpStatus);
    }

    // Re-fetch the updated transaction for the response
    const { data: updatedTransaction } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", id)
      .single();

    return successResponse({
      ...(updatedTransaction ?? {}),
      refund_id: outcome.refundId,
      ...(outcome.providerBalanceWarning
        ? { provider_balance_warning: outcome.providerBalanceWarning }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to process refund");
  }
}
