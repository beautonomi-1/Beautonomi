import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
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
 * POST /api/admin/refunds/booking/[bookingId]
 *
 * Credit customer wallet for in-person / cash bookings with no gateway capture row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { bookingId } = await params;
    const body = await request.json();

    const validationResult = processRefundSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const { refund_amount, refund_reason, notes } = validationResult.data;

    const loaded = await fetchBookingInAdminTenant(
      supabase,
      bookingId,
      tenantId,
      "id, tenant_id, total_paid, total_refunded, wallet_amount, gift_card_amount, payment_status, gift_card_amount",
    );
    if ("error" in loaded) return loaded.error;

    const b = loaded.booking as {
      total_paid?: number;
      total_refunded?: number;
      wallet_amount?: number;
      gift_card_amount?: number;
      payment_status?: string;
    };

    const ps = String(b.payment_status ?? "");
    if (ps !== "paid" && ps !== "partially_paid") {
      return errorResponse(
        "Can only refund paid or partially paid bookings",
        "INVALID_STATUS",
        400,
      );
    }

    const collected = Math.max(
      Number(b.total_paid ?? 0),
      Number(b.wallet_amount ?? 0) + Number(b.gift_card_amount ?? 0),
    );
    const available = Math.max(0, collected - Number(b.total_refunded ?? 0));

    if (refund_amount > available + 0.001) {
      return errorResponse(
        `Refund amount cannot exceed remaining refundable amount (${available.toFixed(2)})`,
        "INVALID_AMOUNT",
        400,
      );
    }

    const outcome = await issueAdminWalletRefund({
      supabase,
      tenantId,
      bookingId,
      amount: refund_amount,
      originalChargeAmount: collected,
      priorRefundAmount: Number(b.total_refunded ?? 0),
      reason: refund_reason,
      actorUserId: user.id,
      actorRole: user.role ?? "superadmin",
      notes: notes ?? null,
      bookingTenderMode: true,
    });

    if (outcome.success === false) {
      return errorResponse(outcome.error, outcome.code, outcome.httpStatus);
    }

    return successResponse({
      refund_id: outcome.refundId,
      amount: outcome.amount,
      ...(outcome.providerBalanceWarning
        ? { provider_balance_warning: outcome.providerBalanceWarning }
        : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to process booking refund");
  }
}
