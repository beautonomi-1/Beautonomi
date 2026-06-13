import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSectionAny, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyOneSignalConfig } from "@/lib/notifications/onesignal";
import { resolveOneSignalCredentials } from "@/lib/platform/secrets";
import { resolveResendCredentials } from "@/lib/integrations/resend";
import {
  ADMIN_SECTION_INTEGRATIONS_DEV,
  ADMIN_SECTION_MARKETING_COMMS,
} from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";

/**
 * GET /api/admin/notifications/config
 *
 * Safe snapshot for the admin SPA: channel toggles + whether secrets exist (no raw credentials).
 * Push / email / SMS tests use OneSignal REST; Twilio appears when configured for SMS/WhatsApp flows.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSectionAny(
      [ADMIN_SECTION_MARKETING_COMMS, ADMIN_SECTION_INTEGRATIONS_DEV],
      request
    );

    const tenantId = await resolveAdminApiTenantId(request);
    const osVerify = await verifyOneSignalConfig({ tenantId });
    const osResolved = await resolveOneSignalCredentials(undefined, { tenantId });
    const appIdSet = !!osResolved.appId?.trim();
    const apiKeySet = !!osResolved.restKey?.trim();

    const supabase = getSupabaseAdmin();
    let emailEnabled = true;
    let smsEnabled = false;
    let pushEnabled = true;
    let onesignalSectionEnabled = true;
    let twilioSectionEnabled = false;

    try {
      const scoped = await fetchScopedSingle<{ settings?: Record<string, unknown> }>({
        supabase,
        table: "platform_settings",
        tenantId,
        select: "settings",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      const settingsRow = scoped.data;

      const s = settingsRow?.settings;
      if (s?.notifications && typeof s.notifications === "object") {
        const n = s.notifications as Record<string, unknown>;
        emailEnabled = n.email_enabled !== false;
        smsEnabled = n.sms_enabled === true;
        pushEnabled = n.push_enabled !== false;
      }
      if (s?.onesignal && typeof s.onesignal === "object") {
        const o = s.onesignal as Record<string, unknown>;
        if (typeof o.enabled === "boolean") onesignalSectionEnabled = o.enabled;
      }
      if (s?.twilio && typeof s.twilio === "object") {
        const t = s.twilio as Record<string, unknown>;
        twilioSectionEnabled = t.enabled === true;
      }
    } catch {
      // dev DB may be partial
    }

    let twilioAccountSid = "";
    let twilioAuthToken = "";
    let twilioSmsFrom = "";
    let twilioWhatsappFrom = "";

    try {
      const { data: secretRow } = await supabase
        .from("platform_secrets")
        .select("twilio_account_sid, twilio_auth_token, twilio_sms_from, twilio_whatsapp_from")
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sr = secretRow as Record<string, string | null | undefined> | null;
      twilioAccountSid = sr?.twilio_account_sid?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim() || "";
      twilioAuthToken = sr?.twilio_auth_token?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim() || "";
      twilioSmsFrom = sr?.twilio_sms_from?.trim() || process.env.TWILIO_SMS_FROM?.trim() || "";
      twilioWhatsappFrom = sr?.twilio_whatsapp_from?.trim() || process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
    } catch {
      twilioAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
      twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
      twilioSmsFrom = process.env.TWILIO_SMS_FROM?.trim() || "";
      twilioWhatsappFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() || "";
    }

    const twilioAccountSidSet = !!twilioAccountSid;
    const twilioAuthTokenSet = !!twilioAuthToken;
    const twilioSmsReady = twilioAccountSidSet && twilioAuthTokenSet && !!twilioSmsFrom;
    const twilioIntegrationActive = twilioSmsReady && twilioSectionEnabled;

    const osReady = appIdSet && apiKeySet && onesignalSectionEnabled;

    const resendCreds = await resolveResendCredentials(supabase, tenantId);
    const resendApiKeySet = !!resendCreds?.apiKey;
    let resendSectionEnabled = true;
    try {
      const scoped = await fetchScopedSingle<{ settings?: Record<string, unknown> }>({
        supabase,
        table: "platform_settings",
        tenantId,
        select: "settings",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      const resendSettings = (scoped.data?.settings?.resend as { enabled?: boolean } | undefined) ?? {};
      if (typeof resendSettings.enabled === "boolean") resendSectionEnabled = resendSettings.enabled;
    } catch {
      // dev DB may be partial
    }
    const resendReady = resendApiKeySet && resendSectionEnabled;

    const custCreds = await resolveOneSignalCredentials("customer", { tenantId });
    const provCreds = await resolveOneSignalCredentials("provider", { tenantId });

    const data = {
      push: {
        enabled: pushEnabled && osReady,
        provider: "onesignal",
        app_id_set: appIdSet,
        api_key_set: apiKeySet,
      },
      email: {
        enabled: emailEnabled && osReady,
        provider: "onesignal",
        api_key_set: apiKeySet,
      },
      /** OneSignal SMS (same REST app as push/email). “Test sms” uses this path. */
      sms: {
        enabled: smsEnabled && osReady,
        provider: "onesignal",
        api_key_set: apiKeySet,
      },
      whatsapp: {
        enabled: twilioIntegrationActive && !!twilioWhatsappFrom,
        provider: "twilio",
        api_key_set: twilioAuthTokenSet,
        from: twilioWhatsappFrom || undefined,
      },
      in_app: {
        enabled: true,
        provider: "beautonomi",
      },
      onesignal: {
        enabled: osReady,
        /** OneSignal feature toggle from platform_settings.settings.onesignal.enabled */
        settings_enabled: onesignalSectionEnabled,
        app_id_set: appIdSet,
        api_key_set: apiKeySet,
      },
      /** Resolved per-app credentials (App IDs are non-secret; use to align Expo env). REST keys: presence only. */
      onesignal_apps: {
        customer: {
          app_id: custCreds.appId,
          rest_api_key_configured: !!custCreds.restKey?.trim(),
        },
        provider: {
          app_id: provCreds.appId,
          rest_api_key_configured: !!provCreds.restKey?.trim(),
        },
      },
      onesignal_alignment: {
        customer_expo_env: "EXPO_PUBLIC_ONESIGNAL_APP_ID in apps/customer — must match Customer App ID saved here.",
        provider_expo_env: "EXPO_PUBLIC_ONESIGNAL_APP_ID in apps/provider — must match Provider App ID saved here.",
        server_rest_keys:
          "REST API keys are server-only (never put in Expo). Save them below or set ONESIGNAL_REST_API_KEY_CUSTOMER / ONESIGNAL_REST_API_KEY_PROVIDER (or legacy single ONESIGNAL_*) in the API environment.",
        broadcast_note:
          "Broadcast to all users uses the customer OneSignal app; broadcast to all providers uses the provider app. Configure both for full coverage.",
      },
      twilio: {
        enabled: twilioIntegrationActive,
        account_sid_set: twilioAccountSidSet,
        auth_token_set: twilioAuthTokenSet,
        from_number: twilioSmsFrom || undefined,
      },
      /** Transactional email (notification queue, broadcasts, guest links, claim invites). */
      resend: {
        enabled: resendReady,
        api_key_set: resendApiKeySet,
        from: resendCreds?.fromAddress || undefined,
        settings_enabled: resendSectionEnabled,
      },
      transactional_email: {
        enabled: resendReady,
        provider: "resend",
        api_key_set: resendApiKeySet,
        from: resendCreds?.fromAddress || undefined,
      },
      diagnostics: {
        onesignal_configured: osVerify.configured,
        onesignal_missing: osVerify.missing,
        /** @deprecated — use diagnostics.onesignal_configured */
        configured: osVerify.configured,
        missing: osVerify.missing,
      },
    };

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "Failed to fetch notification configuration");
  }
}
