import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { UserRole } from "@/types/beautonomi";
import { writeAuditLog } from "@/lib/audit/audit";

const ADMIN_ROLES: UserRole[] = [
  "superadmin",
  "admin_support",
  "admin_finance",
  "admin_trust",
  "admin_content",
  "admin_ecommerce",
  "admin_marketing",
  "admin_integrations",
  "admin_operations",
  "admin_platform_config",
  "support_agent",
];

const patchSchema = z.object({
  role: z
    .enum([
      "superadmin",
      "admin_support",
      "admin_finance",
      "admin_trust",
      "admin_content",
      "admin_ecommerce",
      "admin_marketing",
      "admin_integrations",
      "admin_operations",
      "admin_platform_config",
      "support_agent",
      "customer",
    ] as const)
    .optional(),
  deactivated_at: z.string().nullable().optional(),
  full_name: z.string().min(1).optional(),
});

/**
 * PATCH /api/admin/settings/admin-team/[id]
 * Update admin team member: change role, deactivate/reactivate. Superadmin only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor } = await requireRoleInApi(["superadmin"], request);
    const { id } = await params;

    if (id === actor.id) {
      const body = await request.json();
      if (body.role && body.role !== "superadmin") {
        return errorResponse("Cannot demote your own superadmin account.", "SELF_DEMOTE", 400);
      }
      if (body.deactivated_at) {
        return errorResponse("Cannot deactivate your own account.", "SELF_DEACTIVATE", 400);
      }
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: fetchErr } = await supabase
      .from("users")
      .select("id, role, email, full_name")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !target) return notFoundResponse("Admin user not found");

    const validRoles: UserRole[] = [...ADMIN_ROLES, "customer" as UserRole];
    if (!validRoles.includes(target.role as UserRole)) {
      return errorResponse("Target user is not an admin team member.", "NOT_ADMIN", 400);
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.deactivated_at !== undefined) updateData.deactivated_at = parsed.data.deactivated_at;
    if (parsed.data.full_name !== undefined) updateData.full_name = parsed.data.full_name;

    const { error: updateErr } = await supabase.from("users").update(updateData).eq("id", id);
    if (updateErr) throw updateErr;

    await writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? "superadmin",
      action: "admin.team.update",
      entity_type: "user",
      entity_id: id,
      metadata: {
        email: target.email,
        changes: updateData,
        previous_role: target.role,
      },
    });

    return successResponse({ success: true, changes: updateData });
  } catch (error) {
    return handleApiError(error, "Failed to update admin team member");
  }
}

/**
 * DELETE /api/admin/settings/admin-team/[id]
 * Remove admin access by downgrading role to "customer". Superadmin only.
 * Does NOT delete the auth account — use compliance purge for that.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: actor } = await requireRoleInApi(["superadmin"], request);
    const { id } = await params;

    if (id === actor.id) {
      return errorResponse("Cannot remove your own admin access.", "SELF_REMOVE", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: target, error: fetchErr } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !target) return notFoundResponse("Admin user not found");

    const { error: updateErr } = await supabase
      .from("users")
      .update({ role: "customer" as UserRole, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) throw updateErr;

    await writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? "superadmin",
      action: "admin.team.remove",
      entity_type: "user",
      entity_id: id,
      metadata: { email: target.email, previous_role: target.role, new_role: "customer" },
    });

    return successResponse({
      success: true,
      message: `Admin access removed for ${target.email}. Role downgraded to customer.`,
    });
  } catch (error) {
    return handleApiError(error, "Failed to remove admin access");
  }
}
