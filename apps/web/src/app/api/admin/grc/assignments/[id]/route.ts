import { NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { grcBadRequest, grcFromDbError, grcNotFound } from "@/lib/grc/errors";

const patchSchema = z.union([
  z.strictObject({ revoke: z.literal(true), revoke_reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(1000) }),
  z.strictObject({ expires_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date").nullable() }),
]);

/** Revoke (with reason) or change expiry. Grants themselves are immutable; the DB guard enforces it. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { supabase } = await requireGrcPermission("grc.assignments.manage", request);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw grcBadRequest(parsed.error.issues[0]?.message ?? "Invalid input");

    let patch: Record<string, unknown>;
    if ("revoke" in parsed.data) {
      patch = { is_active: false, revoke_reason: parsed.data.revoke_reason };
    } else {
      const exp = parsed.data.expires_at ? new Date(parsed.data.expires_at).toISOString() : null;
      if (exp && new Date(exp).getTime() <= Date.now()) throw grcBadRequest("Expiry must be in the future; revoke instead");
      patch = { expires_at: exp };
    }

    const { data, error } = await supabase
      .from("grc_role_assignments")
      .update(patch)
      .eq("id", id)
      .eq("is_active", true)
      .select("*")
      .maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!data) throw grcNotFound("Active assignment not found");
    return successResponse({ item: data });
  } catch (error) {
    return handleApiError(error);
  }
}
