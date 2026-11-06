import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  handleApiError,
  successResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_USERS_TRUST } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { revokeAllUserSessions, revokeTrustedDevicesExcept } from "@/lib/auth/auth-security-db";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Reason required (min 5 characters)."),
});

/**
 * POST /api/admin/users/[id]/security/sign-out-all
 * Revokes every session (refresh tokens) and all trusted devices for the user. Access tokens
 * already issued stay valid until they expire (Supabase JWT lifetime, typically ≤ 1 hour).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    const { id } = await params;
    if (id === user.id) {
      return errorResponse("Use Sign out everywhere in your own account settings instead.", "FORBIDDEN", 403);
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? "Reason required", "VALIDATION_ERROR", 400);
    }

    const tenantId = await resolveAdminApiTenantId(request);
    const admin = getSupabaseAdmin();
    const accessible = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, id);
    if (!accessible) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    await revokeAllUserSessions(id);
    await revokeTrustedDevicesExcept(admin, id, null);

    const meta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user.security.sign_out_all",
      entity_type: "user",
      entity_id: id,
      module: "auth_security",
      risk_level: "high",
      metadata: { reason: parsed.data.reason },
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    });

    await sendSecurityAlert({
      key: "security_account_secured",
      userId: id,
      eventId: `admin_sign_out_all:${id}:${Date.now()}`,
    });

    return successResponse({ sessions_revoked: true });
  } catch (error) {
    return handleApiError(error, "Failed to sign the user out everywhere");
  }
}
