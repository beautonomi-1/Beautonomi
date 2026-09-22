import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";

/**
 * POST /api/admin/provider-ops/leads/merge
 * Merge duplicate leads into a primary lead (moves FK-linked rows, soft-deletes extras).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireProviderOpsSales(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();
    const primaryId = typeof body.primary_id === "string" ? body.primary_id : "";
    const duplicateIds: string[] = Array.isArray(body.duplicate_ids)
      ? body.duplicate_ids.filter((id: unknown) => typeof id === "string")
      : [];

    if (!primaryId || duplicateIds.length === 0) {
      return errorResponse("primary_id and duplicate_ids are required", "VALIDATION_ERROR", 400);
    }

    const uniqueDupes = [...new Set(duplicateIds.filter((id) => id !== primaryId))];
    if (uniqueDupes.length === 0) {
      return errorResponse("No duplicate ids to merge", "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const allIds = [primaryId, ...uniqueDupes];

    const { data: leads, error: fetchErr } = await supabase
      .from("provider_leads")
      .select("id, deleted_at")
      .eq("tenant_id", tenantId)
      .in("id", allIds);
    if (fetchErr) throw fetchErr;

    if ((leads ?? []).length !== allIds.length) {
      return errorResponse("One or more leads were not found in this tenant", "NOT_FOUND", 404);
    }
    if ((leads ?? []).some((l) => l.deleted_at)) {
      return errorResponse("Cannot merge deleted leads", "VALIDATION_ERROR", 400);
    }

    for (const dupId of uniqueDupes) {
      await supabase
        .from("provider_lead_activities")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase
        .from("provider_lead_tasks")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase
        .from("provider_lead_communications")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase
        .from("provider_lead_categories")
        .delete()
        .eq("lead_id", dupId);

      await supabase.from("providers").update({ lead_id: primaryId }).eq("lead_id", dupId);
      await supabase
        .from("provider_onboarding_tracking")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase.from("whatsapp_message_queue").update({ lead_id: primaryId }).eq("lead_id", dupId);

      await supabase
        .from("provider_ops_cases")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase
        .from("city_waitlist")
        .update({ lead_id: primaryId })
        .eq("lead_id", dupId);

      await supabase
        .from("provider_leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", dupId);
    }

    await supabase.from("provider_lead_activities").insert({
      lead_id: primaryId,
      activity_type: "lead_merged",
      description: `Merged ${uniqueDupes.length} duplicate lead(s)`,
      metadata: { merged_ids: uniqueDupes },
      performed_by: user.id,
    });

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.merge",
      entity_type: "provider_lead",
      entity_id: primaryId,
      module: "provider_ops",
      risk_level: "high",
      retention_tier: "operational",
      metadata: { merged_ids: uniqueDupes },
      ...extractRequestMeta(request),
    });

    return successResponse({ primary_id: primaryId, merged_ids: uniqueDupes });
  } catch (error) {
    return handleApiError(error, "Failed to merge leads");
  }
}
