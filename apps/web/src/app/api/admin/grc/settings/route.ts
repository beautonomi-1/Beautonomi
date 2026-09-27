import { NextRequest } from "next/server";
import { z } from "zod";
import { GRC_ROLE_LABELS, GRC_ROLE_PERMISSIONS, GRC_ROLES } from "@beautonomi/admin-access";
import { handleApiError, requireGrcPermission, successResponse } from "@/lib/supabase/api-helpers";
import { grcGetHandler } from "@/lib/grc/http";
import { grcBadRequest, grcFromDbError, grcNotFound } from "@/lib/grc/errors";

const days = (max: number) => z.number().int().min(1).max(max);

/** Per-key validation. Keys are seeded by migration 959; new keys need a migration and an entry here. */
const SETTING_SCHEMAS: Record<string, z.ZodType> = {
  risk_appetite_score: z.number().int().min(1).max(25),
  finding_sla_days: z.strictObject({ critical: days(365), high: days(365), medium: days(730), low: days(730), info: days(1095) }),
  evidence_request_lead_days: days(90),
  breach_notification_hours: z.number().int().min(1).max(720),
  dsar_response_days: days(90),
};

export const GET = grcGetHandler("grc.settings.manage", async ({ supabase, grcRoles }) => {
  const { data, error } = await supabase.from("grc_settings").select("key, value, description, updated_by, updated_at").order("key");
  if (error) throw grcFromDbError(error);
  return {
    settings: data ?? [],
    editable_keys: Object.keys(SETTING_SCHEMAS),
    roles: GRC_ROLES.map((r) => ({ role: r, label: GRC_ROLE_LABELS[r], permissions: GRC_ROLE_PERMISSIONS[r] })),
    your_grc_roles: grcRoles,
  };
});

const patchSchema = z.strictObject({ key: z.string(), value: z.unknown() });

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireGrcPermission("grc.settings.manage", request);
    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) throw grcBadRequest("Expected { key, value }");
    const schema = SETTING_SCHEMAS[body.data.key];
    if (!schema) throw grcBadRequest(`"${body.data.key}" is not an editable setting`);
    const value = schema.safeParse(body.data.value);
    if (!value.success) throw grcBadRequest(`${body.data.key}: ${value.error.issues[0]?.message ?? "invalid value"}`);

    const { data, error } = await supabase
      .from("grc_settings")
      .update({ value: value.data })
      .eq("key", body.data.key)
      .select("key, value, updated_at")
      .maybeSingle();
    if (error) throw grcFromDbError(error);
    if (!data) throw grcNotFound("Setting not found");
    return successResponse({ item: data });
  } catch (error) {
    return handleApiError(error);
  }
}
