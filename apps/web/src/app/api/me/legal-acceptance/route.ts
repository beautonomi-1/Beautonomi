import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { NextRequest } from "next/server";

const VALID_APPS = ["partner", "customer"] as const;
type LegalApp = (typeof VALID_APPS)[number];

function eulaFieldPrefix(app: LegalApp): "partner_eula" | "customer_eula" {
  return app === "partner" ? "partner_eula" : "customer_eula";
}

/**
 * POST /api/me/legal-acceptance
 * Record EULA acceptance in user_profiles.privacy_settings.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const app = body?.app as LegalApp | undefined;
    const version = typeof body?.version === "string" ? body.version.trim() : "";

    if (!app || !VALID_APPS.includes(app)) {
      return handleApiError(new Error("Invalid app"), "app must be partner or customer");
    }
    if (!version) {
      return handleApiError(new Error("Invalid version"), "version is required");
    }

    const prefix = eulaFieldPrefix(app);
    const versionKey = `${prefix}_version`;
    const acceptedAtKey = `${prefix}_accepted_at`;

    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("privacy_settings")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentSettings =
      existingProfile?.privacy_settings && typeof existingProfile.privacy_settings === "object"
        ? (existingProfile.privacy_settings as Record<string, unknown>)
        : {};

    const acceptedAt = new Date().toISOString();
    const updatedSettings = {
      ...currentSettings,
      [versionKey]: version,
      [acceptedAtKey]: acceptedAt,
    };

    if (existingProfile) {
      const { error } = await supabase
        .from("user_profiles")
        .update({ privacy_settings: updatedSettings })
        .eq("user_id", user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("user_profiles").insert({
        user_id: user.id,
        privacy_settings: updatedSettings,
      });
      if (error) throw error;
    }

    return successResponse({
      app,
      version,
      accepted_at: acceptedAt,
    });
  } catch (error) {
    return handleApiError(error, "Failed to record legal acceptance");
  }
}
