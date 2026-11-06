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
import {
  revokeAllUserSessions,
  revokeTrustedDevicesExcept,
  syncUserSecurityStateFromFactors,
} from "@/lib/auth/auth-security-db";
import { sendSecurityAlert } from "@/lib/notifications/security-notifications";

const bodySchema = z.object({
  reason: z.string().trim().min(10, "Describe how the user's identity was verified (min 10 characters)."),
});

/**
 * POST /api/admin/users/[id]/security/reset-mfa
 * Break-glass (superadmin): removes the user's authenticator factors and recovery codes,
 * signs them out everywhere and alerts them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_USERS_TRUST, request);
    if (user.role !== "superadmin") {
      return errorResponse("Only a superadmin can reset two-step verification.", "FORBIDDEN", 403);
    }
    const { id } = await params;
    if (id === user.id) {
      return errorResponse("You can't reset your own two-step verification.", "FORBIDDEN", 403);
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

    const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: id });
    if (listError) throw listError;
    let removed = 0;
    for (const f of factors?.factors ?? []) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: id, id: f.id });
      if (error) throw error;
      removed += 1;
    }
    await admin.from("user_mfa_recovery_codes").delete().eq("user_id", id);
    await syncUserSecurityStateFromFactors(admin, id);
    await revokeTrustedDevicesExcept(admin, id, null);
    await revokeAllUserSessions(id);

    const meta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.user.security.reset_mfa",
      entity_type: "user",
      entity_id: id,
      module: "auth_security",
      risk_level: "critical",
      metadata: { factors_removed: removed, reason: parsed.data.reason },
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    });

    if (removed > 0) {
      await sendSecurityAlert({
        key: "security_mfa_disabled",
        userId: id,
        eventId: `admin_reset_mfa:${id}:${Date.now()}`,
      });
    }

    return successResponse({ factors_removed: removed, sessions_revoked: true });
  } catch (error) {
    return handleApiError(error, "Failed to reset two-step verification");
  }
}
