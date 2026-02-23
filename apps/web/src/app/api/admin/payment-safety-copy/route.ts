import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";

const DEFAULT_COPY = {
  title: "Make all payments through Beautonomi",
  body: "Always pay and communicate through Beautonomi to ensure you're protected under our Terms of Service, Payments Terms of Service, cancellation, and other safeguards.",
  learn_more_url: "/terms-and-condition",
  learn_more_label: "Learn more",
};

export async function GET() {
  try {
    await requireRoleInApi(["superadmin"], req);
    const supabase = await getSupabaseServer(req);
    const { data: row } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const settings = (row as any)?.settings ?? {};
    const copy = settings.payment_safety_copy ?? DEFAULT_COPY;
    return successResponse(copy);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], req);
    const supabase = await getSupabaseServer(req);
    const body = await req.json();

    const { data: row } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!row) {
      return successResponse({ message: "No platform settings row to update." });
    }

    const currentSettings = (row as any).settings ?? {};
    const updatedSettings = {
      ...currentSettings,
      payment_safety_copy: {
        title: body.title ?? currentSettings.payment_safety_copy?.title ?? DEFAULT_COPY.title,
        body: body.body ?? currentSettings.payment_safety_copy?.body ?? DEFAULT_COPY.body,
        learn_more_url: body.learn_more_url ?? currentSettings.payment_safety_copy?.learn_more_url ?? DEFAULT_COPY.learn_more_url,
        learn_more_label: body.learn_more_label ?? currentSettings.payment_safety_copy?.learn_more_label ?? DEFAULT_COPY.learn_more_label,
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
      action: "payment_safety_copy_updated",
      entity_type: "platform_settings",
      metadata: {},
    });

    return successResponse({ message: "Payment safety copy saved" });
  } catch (error) {
    return handleApiError(error);
  }
}
