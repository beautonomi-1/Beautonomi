import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { auditBrandMutation } from "@/lib/brand-marketing/brand-audit-helper";
import { briefRowToSnapshot, snapshotBriefVersion } from "@/lib/brand-marketing/brief-versions";

const patchSchema = z.object({
  name: z.string().optional(),
  objective: z.string().optional(),
  market_notes: z.string().optional(),
  budget_envelope: z.coerce.number().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  success_metric: z.enum(["demand", "supply"]).optional(),
  success_target: z.coerce.number().optional(),
  channels_requested: z.array(z.string()).optional(),
  notes: z.string().optional(),
  campaign_type: z.string().optional(),
  business_problem: z.string().optional(),
  proposition: z.string().optional(),
  insight: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  pillar_id: z.string().uuid().nullable().optional(),
  plan_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const patch = patchSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data: before } = await supabase
      .from("brand_briefs")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .maybeSingle();
    if (!before) return errorResponse("Not found", "NOT_FOUND", 404);

    const beforeFields =
      before.fields && typeof before.fields === "object" && !Array.isArray(before.fields)
        ? (before.fields as Record<string, unknown>)
        : {};
    const mergedFields = patch.fields ? { ...beforeFields, ...patch.fields } : beforeFields;
    const updatePayload = {
      ...patch,
      ...(patch.fields ? { fields: mergedFields } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("brand_briefs")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", access.tenantId)
      .select("*")
      .single();
    if (error) throw error;

    const snapshot = briefRowToSnapshot(data as Record<string, unknown>);
    const version = await snapshotBriefVersion(supabase, {
      tenantId: access.tenantId,
      briefId: id,
      fields: snapshot,
      editorId: access.user.id,
    });

    await auditBrandMutation(request, supabase, access, {
      action: "brand.brief_autosaved",
      entityType: "brand_brief",
      entityId: id,
      risk: "low",
      retention: "operational",
      briefId: id,
      before: briefRowToSnapshot(before as Record<string, unknown>),
      after: snapshot,
      body: `Autosave v${version.version_number}`,
    });

    return successResponse({ brief: data, version_number: version.version_number });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to autosave brief");
  }
}
