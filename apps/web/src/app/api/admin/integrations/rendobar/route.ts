import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import {
  explorePublicAppBaseUrl,
  exploreWebhookBaseUrl,
  loadRendobarSecrets,
  rendobarIntegrationReady,
} from "@/lib/explore/rendobar-config";

function maskKey(v: string | null | undefined): string | null {
  if (!v?.trim()) return null;
  const t = v.trim();
  if (t.length <= 8) return "***";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

const patchSchema = z.object({
  rendobar_api_key: z.string().optional(),
  rendobar_callback_secret: z.string().optional(),
  rendobar_storage_connection_id: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const secrets = await loadRendobarSecrets();
    const transcodeEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.EXPLORE_VIDEO_TRANSCODE, null);
    const futureFeatureKeys = [
      FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_AI_CAPTIONS,
      FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_TIMELINE_COMPOSE,
      FEATURE_FLAG_KEYS.EXPLORE_RENDOBAR_SMART_COMPRESSION,
    ] as const;
    const future_features = await Promise.all(
      futureFeatureKeys.map(async (feature_key) => ({
        feature_key,
        effective_enabled: await isFeatureEnabledServer(feature_key, null),
        adapter_status: "not_wired_v1_uses_ffmpeg" as const,
      })),
    );
    const testConnectivity = request.nextUrl.searchParams.get("test") === "1";
    let api_test: { ok: boolean; status: number; message?: string } | undefined;
    if (testConnectivity) {
      if (!secrets.apiKey) {
        api_test = { ok: false, status: 0, message: "No API key configured" };
      } else {
        const res = await fetch("https://api.rendobar.com/jobs/types", {
          headers: { Authorization: `Bearer ${secrets.apiKey}` },
        });
        api_test = {
          ok: res.ok,
          status: res.status,
          message: res.ok ? undefined : (await res.text().catch(() => "")).slice(0, 200) || undefined,
        };
      }
    }
    const publicAppUrl = explorePublicAppBaseUrl();
    return successResponse({
      masked_api_key: maskKey(secrets.apiKey),
      has_api_key: !!secrets.apiKey,
      has_callback_secret: !!secrets.callbackSecret,
      has_storage_connection_id: !!secrets.storageConnectionId,
      has_public_app_url: !!publicAppUrl,
      webhook_callback_url: publicAppUrl ? exploreWebhookBaseUrl() : null,
      env_fallback_api_key: !!process.env.RENDOBAR_API_KEY?.trim(),
      integration_ready: rendobarIntegrationReady(secrets),
      video_transcode_feature: {
        feature_key: FEATURE_FLAG_KEYS.EXPLORE_VIDEO_TRANSCODE,
        effective_enabled: transcodeEnabled,
      },
      future_features,
      ...(api_test ? { api_test } : {}),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Rendobar integration");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return errorResponse("Invalid input", "VALIDATION_ERROR", 400);
    }
    const supabase = getSupabaseAdmin();
    const updates: Record<string, string> = {};
    if (parsed.data.rendobar_api_key?.trim()) updates.rendobar_api_key = parsed.data.rendobar_api_key.trim();
    if (parsed.data.rendobar_callback_secret?.trim()) {
      updates.rendobar_callback_secret = parsed.data.rendobar_callback_secret.trim();
    }
    if (parsed.data.rendobar_storage_connection_id?.trim()) {
      updates.rendobar_storage_connection_id = parsed.data.rendobar_storage_connection_id.trim();
    }
    if (!Object.keys(updates).length) {
      return errorResponse("No secrets to update", "VALIDATION_ERROR", 400);
    }

    const { data: row } = await supabase.from("platform_secrets").select("id").limit(1).maybeSingle();
    if (row?.id) {
      await supabase.from("platform_secrets").update(updates).eq("id", row.id);
    } else {
      await supabase.from("platform_secrets").insert(updates);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.integrations.rendobar.update",
      entity_type: "platform_secrets",
      entity_id: row?.id ?? "global",
      metadata: { fields: Object.keys(updates) },
    });

    return successResponse({ updated: Object.keys(updates) });
  } catch (error) {
    return handleApiError(error, "Failed to update Rendobar integration");
  }
}
