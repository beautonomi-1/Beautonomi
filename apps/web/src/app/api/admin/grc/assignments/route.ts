import { NextRequest } from "next/server";
import { z } from "zod";
import { GRC_ROLES } from "@beautonomi/admin-access";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { grcGetHandler } from "@/lib/grc/http";
import { loadGrcDirectory } from "@/lib/grc/directory";
import { grcBadRequest, grcConflict, grcFromDbError } from "@/lib/grc/errors";

export const GET = grcGetHandler("grc.assignments.manage", async ({ supabase }) => {
  const { data, error } = await supabase
    .from("grc_role_assignments")
    .select("id, user_id, grc_role, reason, assigned_by, expires_at, is_active, created_at, revoked_by, revoked_at, revoke_reason")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw grcFromDbError(error);
  return { items: data ?? [], roles: GRC_ROLES };
});

const grantSchema = z.strictObject({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  grc_role: z.enum(GRC_ROLES),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(1000),
  expires_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date").nullish(),
});

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireGrcPermission("grc.assignments.manage", request);
    const parsed = grantSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");
    const input = parsed.data;

    const expiresAt = input.expires_at ? new Date(input.expires_at).toISOString() : null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw grcBadRequest("Expiry must be in the future");

    const target = (await loadGrcDirectory()).find((u) => (u.email ?? "").toLowerCase() === input.email);
    if (!target) throw grcBadRequest("No admin portal user has that email. Give them an admin role first.");

    const { data, error } = await supabase
      .from("grc_role_assignments")
      .insert({ user_id: target.id, grc_role: input.grc_role, reason: input.reason, expires_at: expiresAt })
      .select("*")
      .single();
    if (error?.code === "23505") throw grcConflict("This person already holds that role. Revoke it first to re-grant.");
    if (error) throw grcFromDbError(error);
    return successResponse({ item: data }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
