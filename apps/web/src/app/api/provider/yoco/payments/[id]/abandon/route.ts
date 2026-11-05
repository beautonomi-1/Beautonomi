import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { syncYocoPaymentStatusFromGateway } from "@/lib/payments/yoco-sync-status";

/**
 * POST /api/provider/yoco/payments/[id]/abandon
 * Mark a pending Yoco checkout as cancelled when the provider closed the sheet.
 * Syncs with Yoco first; a payment that succeeded upstream is never cancelled.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const permissionCheck = await requirePermission("process_payments", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }

    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const admin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase, { request });
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: row } = await admin
      .from("provider_yoco_payments")
      .select("id, status, yoco_device_id, yoco_payment_id, metadata")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!row) {
      return notFoundResponse("Payment not found");
    }

    const latestStatus = await syncYocoPaymentStatusFromGateway(admin, providerId, row);
    if (latestStatus === "successful") {
      return errorResponse(
        "This payment already succeeded on the machine.",
        "PAYMENT_ALREADY_SUCCESSFUL",
        409,
      );
    }
    if (latestStatus !== "pending") {
      return successResponse({ payment: { ...row, status: latestStatus } });
    }

    const { data: updated, error } = await admin
      .from("provider_yoco_payments")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        metadata: {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          abandoned_by: permissionCheck.user.id,
        },
      })
      .eq("id", id)
      .eq("provider_id", providerId)
      .in("status", ["pending"])
      .select()
      .maybeSingle();

    if (error) throw error;
    return successResponse({ payment: updated ?? row });
  } catch (error) {
    return handleApiError(error, "Failed to abandon Yoco payment");
  }
}
