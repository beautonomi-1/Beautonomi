import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

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

    await supabase
      .from("whatsapp_bulk_batches")
      .update({ status: "paused", pause_reason: `Paused by ${user.role}` })
      .eq("id", batchId);

    return successResponse({ paused: true });
  } catch (error) {
    return handleApiError(error, "Failed to pause batch");
  }
}
