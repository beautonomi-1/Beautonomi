import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { batchId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: batch } = await supabase
      .from("whatsapp_bulk_batches")
      .select("id, status")
      .eq("id", batchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!batch) return notFoundResponse("Batch not found");

    // Cancel all queued/rate_limited messages
    const { data: cancelledRows } = await supabase
      .from("whatsapp_message_queue")
      .update({ status: "cancelled" })
      .eq("bulk_batch_id", batchId)
      .in("status", ["queued", "rate_limited"])
      .select("id");
    const cancelledCount = cancelledRows?.length ?? 0;

    await supabase
      .from("whatsapp_bulk_batches")
      .update({
        status: "cancelled",
        cancelled_count: cancelledCount,
        queued_count: 0,
      })
      .eq("id", batchId);

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.whatsapp.bulk.cancelled",
      entity_type: "whatsapp_bulk_batch",
      entity_id: batchId,
      module: "whatsapp",
      risk_level: "medium",
      metadata: { cancelled_count: cancelledCount },
      ...extractRequestMeta(request),
    });

    return successResponse({ cancelled: true, cancelled_count: cancelledCount });
  } catch (error) {
    return handleApiError(error, "Failed to cancel batch");
  }
}
