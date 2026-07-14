import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, getPaginationParams } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const { batchId } = await params;
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: batch } = await supabase
      .from("whatsapp_bulk_batches")
      .select("*")
      .eq("id", batchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!batch) return notFoundResponse("Batch not found");

    const { page, limit, offset } = getPaginationParams(request);
    const { data: messages, count } = await supabase
      .from("whatsapp_message_queue")
      .select("id, lead_id, to_number, status, message_body, sent_at, failed_at, failure_reason, retry_count, created_at", { count: "exact" })
      .eq("bulk_batch_id", batchId)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: statusRows } = await supabase
      .from("whatsapp_message_queue")
      .select("status")
      .eq("bulk_batch_id", batchId);

    const status_counts: Record<string, number> = {};
    for (const row of statusRows as { status: string }[] || []) {
      status_counts[row.status] = (status_counts[row.status] || 0) + 1;
    }

    return successResponse({
      batch,
      messages: messages || [],
      status_counts,
      meta: { page, limit, total: count || 0, has_more: (count || 0) > page * limit },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch batch detail");
  }
}
