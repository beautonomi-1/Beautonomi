import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
 } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { z } from "zod";

const bodySchema = z.object({ version: z.number().int().optional() });

/**
 * POST /api/admin/service-zones/[id]/publish
 * Set zone status to 'active'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_OPERATIONS, request);
    const supabase = await getSupabaseServer(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parse = bodySchema.safeParse(body);

    const { data: zone, error: fetchError } = await supabase
      .from("platform_zones")
      .select("id, status, version, geometry, published_at")
      .eq("id", id)
      .single();

    if (fetchError || !zone) return notFoundResponse("Zone not found");

    if (parse.data?.version != null && (zone as { version?: number }).version !== parse.data.version) {
      return errorResponse("Version conflict; refresh and retry", "CONFLICT", 409);
    }

    const zrow = zone as { geometry?: unknown; published_at?: string | null };
    if (!zrow.geometry) {
      return errorResponse(
        "Cannot publish: add coverage (cities or postals) so the zone has geometry first.",
        "VALIDATION_ERROR",
        400
      );
    }

    const now = new Date().toISOString();
    const firstPublishAt = zrow.published_at ?? now;

    const { data: updated, error: updateError } = await supabase
      .from("platform_zones")
      .update({
        status: "active",
        is_active: true,
        updated_at: now,
        published_at: firstPublishAt,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Auto-enroll qualifying providers — non-fatal if it fails
    let enrolledCount = 0;
    try {
      const { data: enrollResult } = await supabase.rpc(
        "auto_enroll_providers_for_zone",
        { p_zone_id: id }
      );
      enrolledCount =
        (enrollResult as { enrolled?: number } | null)?.enrolled ?? 0;
    } catch {
      // Zone is live regardless; enrollment can be re-triggered manually
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id, actor_role: user.role,
      action: "admin.service_zone.publish", entity_type: "platform_zone",
      entity_id: id, module: "operations", risk_level: "medium",
      retention_tier: "operational", status: "succeeded",
      ip_address: reqMeta.ip_address, user_agent: reqMeta.user_agent,
    });

    return successResponse({ ...(updated as object), enrolled_count: enrolledCount });
  } catch (error) {
    return handleApiError(error, "Failed to publish zone");
  }
}
