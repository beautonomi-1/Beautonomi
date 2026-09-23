import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { assignProviderLead } from "@/lib/provider-ops/lead-assign-update";

const MAX_ITEMS = 500;

const bodySchema = z.object({
  assigned_to: z.union([z.string().uuid(), z.null()]),
  assigned_to_name: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        expected_updated_at: z.string().optional(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
});

/**
 * POST /api/admin/provider-ops/leads/bulk-assign
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireProviderOpsSales(request);
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.flatten().formErrors.join("; ") || "Validation failed",
        "VALIDATION_ERROR",
        400,
      );
    }

    const uniqueItems = [...new Map(parsed.data.items.map((i) => [i.id, i])).values()];
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const updated: string[] = [];
    const conflicts: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const notFound: string[] = [];

    for (const item of uniqueItems) {
      const result = await assignProviderLead(
        supabase,
        tenantId,
        item.id,
        {
          assigned_to: parsed.data.assigned_to,
          assigned_to_name: parsed.data.assigned_to_name,
          expected_updated_at: item.expected_updated_at,
        },
        { id: user.id, role: user.role },
        request,
      );
      if (result.ok) {
        updated.push(item.id);
        continue;
      }
      if (result.code === "CONCURRENT_UPDATE") conflicts.push(item.id);
      else if (result.code === "NOT_FOUND") notFound.push(item.id);
      else skipped.push({ id: item.id, reason: result.message });
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "admin.lead.bulk_assign",
      entity_type: "provider_lead",
      entity_id: updated.length ? `${updated.length}_leads` : "none",
      module: "provider_ops",
      risk_level: "low",
      retention_tier: "routine",
      metadata: {
        assigned_to: parsed.data.assigned_to,
        updated_count: updated.length,
        conflicts_count: conflicts.length,
        skipped_count: skipped.length,
        not_found_count: notFound.length,
        lead_ids_sample: updated.slice(0, 40),
      },
      ...extractRequestMeta(request),
    });

    return successResponse({ updated, conflicts, skipped, not_found: notFound });
  } catch (error) {
    return handleApiError(error, "Failed to bulk assign leads");
  }
}
