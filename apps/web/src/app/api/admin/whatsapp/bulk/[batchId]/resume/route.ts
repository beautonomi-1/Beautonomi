import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, notFoundResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function POST(
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
      .select("id, status, session_id")
      .eq("id", batchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!batch) return notFoundResponse("Batch not found");
    const batchRow = batch as Record<string, any>;

    if (batchRow.status !== "paused") {
      return errorResponse("Batch is not paused", "INVALID_STATE", 400);
    }

    // Check session cooldown
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("is_paused, paused_at")
      .eq("id", batchRow.session_id)
      .maybeSingle();

    const sessionRow = session as Record<string, any> | null;
    if (sessionRow?.is_paused && sessionRow.paused_at) {
      const { data: cfg } = await supabase
        .from("wasender_integration_config")
        .select("cooldown_minutes_after_pause")
        .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
        .eq("enabled", true)
        .limit(1)
        .maybeSingle();

      const cooldownMin = (cfg as any)?.cooldown_minutes_after_pause ?? 30;
      const pausedAt = new Date(sessionRow.paused_at).getTime();
      const cooldownEnd = pausedAt + cooldownMin * 60 * 1000;

      if (Date.now() < cooldownEnd) {
        const remainingMin = Math.ceil((cooldownEnd - Date.now()) / 60000);
        return errorResponse(
          `Session is in cooldown. ${remainingMin} minute(s) remaining.`,
          "COOLDOWN_ACTIVE",
          400,
        );
      }

      // Lift session pause
      await supabase
        .from("whatsapp_sessions")
        .update({ is_paused: false, pause_reason: null, paused_at: null })
        .eq("id", batchRow.session_id);
    }

    await supabase
      .from("whatsapp_bulk_batches")
      .update({ status: "processing", pause_reason: null })
      .eq("id", batchId);

    return successResponse({ resumed: true });
  } catch (error) {
    return handleApiError(error, "Failed to resume batch");
  }
}
