import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { applyActiveLeadFilter } from "@/lib/provider-ops/lead-query-filters";

const MAX_IDS = 500;

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "At least one lead id is required").max(MAX_IDS),
});

/**
 * POST /api/admin/provider-ops/leads/bulk-delete
 *
 * Deletes multiple leads in one request. Same rules as single DELETE:
 * leads with `matched_provider_id` set are skipped (cannot bulk-unlink here).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.flatten().formErrors.join("; ") || "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    const uniqueIds = [...new Set(parsed.data.ids)];
    if (uniqueIds.length > MAX_IDS) {
      return errorResponse(`Maximum ${MAX_IDS} leads per request`, "VALIDATION_ERROR", 400);
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    let fetchQuery = supabase
      .from("provider_leads")
      .select("id, matched_provider_id, deleted_at")
      .eq("tenant_id", tenantId)
      .in("id", uniqueIds);
    fetchQuery = applyActiveLeadFilter(fetchQuery, "active");
    const { data: leads, error: fetchErr } = await fetchQuery;

    if (fetchErr) throw fetchErr;

    const found = leads ?? [];
    const foundIds = new Set(found.map((l) => l.id));
    const notFound = uniqueIds.filter((id) => !foundIds.has(id));

    const toDelete = found.filter((l) => !l.matched_provider_id).map((l) => l.id);
    const skippedMatched = found.filter((l) => l.matched_provider_id).map((l) => l.id);

    if (toDelete.length > 0) {
      const now = new Date().toISOString();
      const { error: delErr } = await supabase
        .from("provider_leads")
        .update({ deleted_at: now, deleted_by: user.id })
        .in("id", toDelete)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (delErr) throw delErr;

      const activityRows = toDelete.map((leadId) => ({
        lead_id: leadId,
        activity_type: "lead_deleted",
        description: "Lead moved to trash (bulk)",
        metadata: { soft_delete: true, bulk: true },
        performed_by: user.id,
      }));
      const { error: actErr } = await supabase
        .from("provider_lead_activities")
        .insert(activityRows);
      if (actErr) throw actErr;
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.bulk_delete",
      entity_type: "provider_lead",
      entity_id: toDelete.length ? `${toDelete.length}_leads` : "none",
      module: "provider_ops",
      risk_level: "high",
      retention_tier: "operational",
      metadata: {
        deleted_count: toDelete.length,
        skipped_matched_count: skippedMatched.length,
        not_found_count: notFound.length,
        lead_ids_sample: toDelete.slice(0, 40),
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      deleted: toDelete.length,
      skipped_matched: skippedMatched,
      not_found: notFound,
    });
  } catch (error) {
    return handleApiError(error, "Failed to bulk delete leads");
  }
}
