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
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { getCollectedTotalForBooking } from "@/lib/finance/get-collected-total-for-booking";
import { issueAdminWalletRefund } from "@/lib/finance/issue-admin-wallet-refund";
import { z } from "zod";

const updateDisputeSchema = z.object({
  status: z.enum(["open", "resolved", "closed"]).optional(),
  resolution: z.enum(["refund_full", "refund_partial", "deny"]).optional().nullable(),
  refund_amount: z.number().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/disputes/[id]
 *
 * Get a single dispute by ID (tenant-scoped via booking join).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDERS_OPERATIONS,
      request
    );
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: dispute, error } = await supabase
      .from("booking_disputes")
      .select(`
        id,
        booking_id,
        reason,
        description,
        opened_by,
        status,
        opened_at,
        resolved_at,
        resolution,
        refund_amount,
        notes,
        created_at,
        updated_at,
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
        )
      `)
      .eq("id", id)
      .eq("booking.tenant_id", tenantId)
      .single();

    if (error || !dispute) {
      return notFoundResponse("Dispute not found");
    }

    return successResponse(dispute);
  } catch (error) {
    return handleApiError(error, "Failed to fetch dispute");
  }
}

/**
 * PATCH /api/admin/disputes/[id]
 *
 * Update a dispute — resolve (optionally issuing a real wallet refund), close, or add notes.
 *
 * When transitioning to status="resolved" with resolution="refund_full" or
 * "refund_partial" the customer's wallet is credited via `issueAdminWalletRefund`
 * (idempotent — only fires when the dispute is currently "open").
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(
      ADMIN_SECTION_PROVIDERS_OPERATIONS,
      request
    );
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    const validationResult = updateDisputeSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    // Load current dispute
    const { data: existingDispute } = await supabase
      .from("booking_disputes")
      .select("id, booking_id, status, resolved_at")
      .eq("id", id)
      .single();

    if (!existingDispute) {
      return notFoundResponse("Dispute not found");
    }

    // Verify the booking belongs to this tenant
    type DisputeRef = { booking_id: string; status: string };
    const bookingCheck = await fetchBookingInAdminTenant(
      supabase,
      (existingDispute as DisputeRef).booking_id,
      tenantId,
      "id, tenant_id"
    );
    if ("error" in bookingCheck) {
      return notFoundResponse("Dispute not found");
    }

    const { status: newStatus, resolution, refund_amount, notes } =
      validationResult.data;

    const disputeCurrentStatus = (existingDispute as DisputeRef).status;
    const bookingId = (existingDispute as DisputeRef).booking_id;

    // --- Wallet refund logic -----------------------------------------------
    // Only fire when:
    //   1. Transitioning to "resolved" (idempotency: dispute must currently be "open")
    //   2. Resolution requests a monetary refund
    // This prevents double-credits if an admin re-PATCHes a resolved dispute.
    let actualRefundAmount: number | null = null;
    let providerBalanceWarning: string | null = null;

    const isResolvingFromOpen =
      newStatus === "resolved" && disputeCurrentStatus === "open";

    if (
      isResolvingFromOpen &&
      (resolution === "refund_full" || resolution === "refund_partial")
    ) {
      // Determine refund amount
      const collectedTotal = await getCollectedTotalForBooking(supabase, bookingId);

      if (collectedTotal <= 0) {
        return errorResponse(
          "No collectable amount remains for this booking — refund cannot be issued",
          "NO_COLLECTABLE_AMOUNT",
          422
        );
      }

      let amountToRefund: number;
      if (resolution === "refund_full") {
        amountToRefund = collectedTotal;
      } else {
        // refund_partial
        if (!refund_amount || refund_amount <= 0) {
          return errorResponse(
            "refund_amount is required and must be positive for a partial refund",
            "INVALID_AMOUNT",
            400
          );
        }
        if (refund_amount > collectedTotal) {
          return errorResponse(
            `Refund amount (${refund_amount}) exceeds the collected total for this booking (${collectedTotal})`,
            "EXCEEDS_COLLECTED_TOTAL",
            400
          );
        }
        amountToRefund = refund_amount;
      }

      const outcome = await issueAdminWalletRefund({
        supabase,
        tenantId,
        bookingId,
        amount: amountToRefund,
        originalChargeAmount: collectedTotal,
        reason: notes
          ? `Dispute resolved: ${notes}`
          : `Dispute resolved — ${resolution.replace(/_/g, " ")}`,
        actorUserId: user.id,
        actorRole: user.role ?? "superadmin",
        notes: notes ?? null,
      });

      if (outcome.success === false) {
        return errorResponse(outcome.error, outcome.code, outcome.httpStatus);
      }

      actualRefundAmount = outcome.amount;
      providerBalanceWarning = outcome.providerBalanceWarning ?? null;
    }

    // --- Persist dispute update -------------------------------------------
    const updateData: Record<string, unknown> = {};

    if (newStatus !== undefined) {
      updateData.status = newStatus;
      if (newStatus === "resolved" && !(existingDispute as { resolved_at?: string | null }).resolved_at) {
        updateData.resolved_at = new Date().toISOString();
      }
    }
    if (resolution !== undefined) {
      updateData.resolution = resolution;
    }
    // Store the actual credited amount (may differ from requested for full refunds)
    if (actualRefundAmount !== null) {
      updateData.refund_amount = actualRefundAmount;
    } else if (refund_amount !== undefined) {
      updateData.refund_amount = refund_amount;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data: updatedDispute, error: updateErr } = await supabase
      .from("booking_disputes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.dispute.update",
      entity_type: "booking_dispute",
      entity_id: id,
      metadata: {
        ...updateData,
        wallet_refund_issued: actualRefundAmount !== null,
        provider_balance_warning: providerBalanceWarning,
      },
    });

    return successResponse({
      ...(updatedDispute as Record<string, unknown>),
      ...(providerBalanceWarning
        ? { provider_balance_warning: providerBalanceWarning }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update dispute");
  }
}
