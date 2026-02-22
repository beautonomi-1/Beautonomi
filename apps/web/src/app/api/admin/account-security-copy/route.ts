import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

/**
 * GET /api/admin/account-security-copy
 * Returns the account security sidebar copy for superadmin editing.
 */
export async function GET() {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const { data: row } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const settings = (row as any)?.settings ?? {};
    const copy = settings.account_security_copy ?? {
      title: "Keeping your account secure",
      body: "We regularly review accounts to make sure they're as secure as possible. We'll also let you know if there's more we can do to increase the security of your account.",
      safety_tips_customer: { label: "Safety tips for customers", url: "/help#customer" },
      safety_tips_provider: { label: "Safety tips for providers", url: "/help#provider" },
    };
    return successResponse(copy);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/admin/account-security-copy
 * Update the account security sidebar copy (superadmin only).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    const body = await req.json();

    const { data: row } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!row) {
      return successResponse({ message: "No platform settings row to update; account security copy will use defaults until a row exists." });
    }

    const currentSettings = (row as any).settings ?? {};
    const updatedSettings = {
      ...currentSettings,
      account_security_copy: {
        title: body.title ?? currentSettings.account_security_copy?.title ?? "Keeping your account secure",
        body: body.body ?? currentSettings.account_security_copy?.body ?? "",
        safety_tips_customer:
          body.safety_tips_customer && typeof body.safety_tips_customer === "object"
            ? {
                label: body.safety_tips_customer.label ?? "Safety tips for customers",
                url: body.safety_tips_customer.url ?? "/help#customer",
              }
            : currentSettings.account_security_copy?.safety_tips_customer ?? {
                label: "Safety tips for customers",
                url: "/help#customer",
              },
        safety_tips_provider:
          body.safety_tips_provider && typeof body.safety_tips_provider === "object"
            ? {
                label: body.safety_tips_provider.label ?? "Safety tips for providers",
                url: body.safety_tips_provider.url ?? "/help#provider",
              }
            : currentSettings.account_security_copy?.safety_tips_provider ?? {
                label: "Safety tips for providers",
                url: "/help#provider",
              },
      },
    };

    const { error } = await supabase
      .from("platform_settings")
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (row as any).id);

    if (error) throw error;

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: (user as { role?: string }).role ?? null,
      action: "account_security_copy_updated",
      entity_type: "platform_settings",
      metadata: {},
    });

    return successResponse({ message: "Account security copy saved" });
  } catch (error) {
    return handleApiError(error);
  }
}
