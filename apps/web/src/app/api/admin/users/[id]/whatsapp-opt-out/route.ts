import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { z } from "zod";

const bodySchema = z.object({
  action: z.literal("clear_stop"),
  reason: z.string().min(3).max(500),
});

/**
 * POST /api/admin/users/[id]/whatsapp-opt-out
 * Clear WhatsApp STOP (`whatsapp_opted_out_at`) after support verification — audited.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();

    const accessible = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!accessible) return notFoundResponse("User not found");

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Invalid request body", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }

    const prior = (accessible as { whatsapp_opted_out_at?: string | null }).whatsapp_opted_out_at;
    if (!prior) {
      return errorResponse("User has not opted out of WhatsApp (no STOP on file)", "VALIDATION_ERROR", 400);
    }

    const { error } = await admin
      .from("users")
      .update({
        whatsapp_opted_out_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "admin",
      action: "admin.user.whatsapp_stop_cleared",
      entity_type: "user",
      entity_id: id,
      metadata: {
        reason: parsed.data.reason,
        prior_whatsapp_opted_out_at: prior ?? null,
      },
      ...extractRequestMeta(request),
    });

    return successResponse({ message: "WhatsApp STOP cleared for this user." });
  } catch (error) {
    return handleApiError(error, "Failed to update WhatsApp opt-out");
  }
}
