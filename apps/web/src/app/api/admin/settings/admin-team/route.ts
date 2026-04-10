import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
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

const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  full_name: z.string().min(1, "Name required"),
  role: z.enum([
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
  ] as const),
});

/**
 * GET /api/admin/settings/admin-team
 * Returns all platform admin users. Superadmin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    void user;

    const supabase = getSupabaseAdmin();

    const { data: adminUsers, error } = await supabase
      .from("users")
      .select("id, full_name, email, phone, role, avatar_url, created_at, deactivated_at, last_sign_in_at")
      .in("role", ADMIN_ROLES)
      .order("role", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successResponse({
      members: adminUsers ?? [],
      total: (adminUsers ?? []).length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch admin team");
  }
}

/**
 * POST /api/admin/settings/admin-team
 * Invite a new platform admin by email (sends Supabase magic link / invite email).
 * Superadmin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { user: actor } = await requireRoleInApi(["superadmin"], request);

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        parsed.error.issues.map((i) => ({ path: i.path, message: i.message }))
      );
    }

    const { email, full_name, role } = parsed.data;
    const supabase = getSupabaseAdmin();

    // Check if user already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // User exists — update their role to the admin role
      if (ADMIN_ROLES.includes(existing.role as UserRole) && existing.role === role) {
        return errorResponse(
          `User ${email} already has role "${role}". No change made.`,
          "ALREADY_EXISTS",
          409
        );
      }

      const { error: updateErr } = await supabase
        .from("users")
        .update({ role: role as UserRole, full_name })
        .eq("id", existing.id);

      if (updateErr) throw updateErr;

      await writeAuditLog({
        actor_user_id: actor.id,
        actor_role: actor.role ?? "superadmin",
        action: "admin.team.role.promote",
        entity_type: "user",
        entity_id: existing.id,
        metadata: { email, role: { from: existing.role, to: role }, full_name },
      });

      return successResponse({
        message: `Existing user promoted to ${role}.`,
        user_id: existing.id,
        action: "promoted",
      });
    }

    // New user — send invite email via Supabase Auth
    const { data: authData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name,
        role,
      },
    });

    if (inviteErr || !authData?.user) {
      throw inviteErr ?? new Error("Invite failed");
    }

    // Upsert the users row so role is correct even before they accept
    const { error: upsertErr } = await supabase.from("users").upsert(
      {
        id: authData.user.id,
        email,
        full_name,
        role: role as UserRole,
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

    if (upsertErr) {
      console.error("admin-team invite upsert error:", upsertErr);
    }

    await writeAuditLog({
      actor_user_id: actor.id,
      actor_role: actor.role ?? "superadmin",
      action: "admin.team.invite",
      entity_type: "user",
      entity_id: authData.user.id,
      metadata: { email, role, full_name },
    });

    return successResponse({
      message: `Invite sent to ${email} as ${role}.`,
      user_id: authData.user.id,
      action: "invited",
    });
  } catch (error) {
    return handleApiError(error, "Failed to invite admin");
  }
}
