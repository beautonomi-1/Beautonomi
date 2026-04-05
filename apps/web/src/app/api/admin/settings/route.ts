import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { fetchScopedSingle, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

interface PlatformSettings {
  branding: {
    site_name: string;
    logo_url: string;
    favicon_url: string;
    primary_color: string;
    secondary_color: string;
  };
  localization: {
    default_language: string;
    supported_languages: string[];
    default_currency: string;
    supported_currencies: string[];
    timezone: string;
  };
  payouts: {
    provider_payout_percentage: number;
    payout_schedule: "daily" | "weekly" | "monthly";
    minimum_payout_amount: number;
    /** Earnings become available for payout after this many days (0 = immediate). */
    payout_hold_days?: number;
    platform_service_fee_type: "percentage" | "fixed";
    platform_service_fee_percentage: number;
    platform_service_fee_fixed: number;
    platform_commission_percentage: number;
    show_service_fee_to_customer: boolean;
  };
  notifications: {
    email_enabled: boolean;
    sms_enabled: boolean;
    push_enabled: boolean;
  };
  payment_types: {
    cash: boolean;
    card: boolean;
    mobile: boolean;
    gift_card: boolean;
  };
  features: {
    auto_approve_providers: boolean;
  };
  paystack: {
    secret_key: string;
    public_key: string;
    use_transaction_splits: boolean;
    default_split_code?: string;
    transfer_otp_required: boolean;
    /** When true, do not call Paystack account verify when adding payout accounts; admin handles failures (e.g. provider uploads bank confirmation letter). */
    skip_payout_account_verification: boolean;
    webhook_secret?: string;
  };
  verification: {
    otp_enabled: boolean; // Enable OTP verification for at-home bookings
    qr_code_enabled: boolean; // Enable QR code verification for at-home bookings
    require_verification: boolean; // If false, simple provider confirmation is enough
  };
  onesignal: {
    app_id: string;
    app_id_provider?: string;
    /** Customer app REST key (stored in platform_secrets.onesignal_rest_api_key). */
    rest_api_key: string;
    /** Provider app REST key (stored in platform_secrets.onesignal_rest_api_key_provider). */
    rest_api_key_provider?: string;
    safari_web_id?: string;
    enabled: boolean;
  };
  mapbox: {
    access_token: string;
    public_token: string;
    enabled: boolean;
  };
  amplitude: {
    api_key: string;
    secret_key?: string;
    enabled: boolean;
  };
  google: {
    maps_api_key: string;
    places_api_key?: string;
    analytics_id?: string;
    enabled: boolean;
  };
  calendar_integrations: {
    google: {
      client_id: string;
      client_secret: string;
      enabled: boolean;
    };
    outlook: {
      client_id: string;
      client_secret: string;
      enabled: boolean;
    };
    apple: {
      enabled: boolean;
    };
  };
  apps: {
    customer: {
      android: {
        package_name: string;
        version: string;
        min_version: string;
        download_url: string;
        enabled: boolean;
      };
      ios: {
        bundle_id: string;
        version: string;
        min_version: string;
        app_store_url: string;
        enabled: boolean;
      };
      huawei: {
        package_name: string;
        version: string;
        min_version: string;
        app_gallery_url: string;
        enabled: boolean;
      };
    };
    provider: {
      android: {
        package_name: string;
        version: string;
        min_version: string;
        download_url: string;
        enabled: boolean;
      };
      ios: {
        bundle_id: string;
        version: string;
        min_version: string;
        app_store_url: string;
        enabled: boolean;
      };
      huawei: {
        package_name: string;
        version: string;
        min_version: string;
        app_gallery_url: string;
        enabled: boolean;
      };
    };
  };
}

function getDefaultPlatformSettings(): PlatformSettings {
  return {
      branding: {
        site_name: "Beautonomi",
        logo_url: "/images/logo.svg",
        favicon_url: "/icon.svg",
        primary_color: "#FF0077",
        secondary_color: "#D60565",
      },
      localization: {
        default_language: "en",
        supported_languages: ["en", "af", "zu"],
        default_currency: LAST_RESORT_CURRENCY,
        supported_currencies: [LAST_RESORT_CURRENCY, "USD", "EUR"],
        timezone: "Africa/Johannesburg",
      },
      payouts: {
        provider_payout_percentage: 85,
        payout_schedule: "weekly",
        minimum_payout_amount: 100,
        payout_hold_days: 0,
        platform_service_fee_type: "percentage",
        platform_service_fee_percentage: 5,
        platform_service_fee_fixed: 0,
        platform_commission_percentage: 0,
        show_service_fee_to_customer: true,
      },
      notifications: {
        email_enabled: true,
        sms_enabled: false,
        push_enabled: true,
      },
      payment_types: {
        cash: false,
        card: true,
        mobile: true,
        gift_card: true,
      },
      features: {
        auto_approve_providers: false,
      },
      paystack: {
        secret_key: process.env.PAYSTACK_SECRET_KEY || "",
        public_key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "",
        use_transaction_splits: false,
        default_split_code: undefined,
        transfer_otp_required: true,
        skip_payout_account_verification: false,
        webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET || undefined,
      },
      verification: {
        otp_enabled: true, // Default: OTP enabled
        qr_code_enabled: true, // Default: QR code enabled
        require_verification: true, // Default: Verification required (if both disabled, this should be false)
      },
      onesignal: {
        app_id: process.env.ONESIGNAL_APP_ID || "",
        app_id_provider: process.env.ONESIGNAL_APP_ID_PROVIDER || undefined,
        rest_api_key: "",
        rest_api_key_provider: "",
        safari_web_id: process.env.ONESIGNAL_SAFARI_WEB_ID || undefined,
        enabled: true,
      },
      mapbox: {
        access_token: "",
        public_token: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "",
        enabled: true,
      },
      amplitude: {
        api_key: process.env.AMPLITUDE_API_KEY || "",
        secret_key: undefined,
        enabled: true,
      },
      google: {
        maps_api_key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        places_api_key: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || undefined,
        analytics_id: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID || undefined,
        enabled: true,
      },
      calendar_integrations: {
        google: {
          client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
          client_secret: "",
          enabled: false,
        },
        outlook: {
          client_id: process.env.OUTLOOK_CLIENT_ID || "",
          client_secret: "",
          enabled: false,
        },
        apple: {
          enabled: true, // iCal doesn't need OAuth, so enabled by default
        },
      },
      apps: {
        customer: {
          android: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.customer",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "",
            enabled: false,
          },
        },
        provider: {
          android: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            download_url: "",
            enabled: true,
          },
          ios: {
            bundle_id: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_store_url: "",
            enabled: true,
          },
          huawei: {
            package_name: "com.beautonomi.provider",
            version: "1.0.0",
            min_version: "1.0.0",
            app_gallery_url: "",
            enabled: false,
          },
        },
      },
    };
}

/** Defaults merged with tenant region currency (ZAR only as last resort). */
async function getTenantAwareDefaultPlatformSettings(
  request: NextRequest,
  tenantId: string | null
): Promise<PlatformSettings> {
  const base = getDefaultPlatformSettings();
  const effectiveTenantId = tenantId ?? (await resolveAdminApiTenantId(request));
  const tr = await getTenantRegionConfig(effectiveTenantId);
  const dc = tr?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  return {
    ...base,
    localization: {
      ...base.localization,
      default_currency: dc,
      supported_currencies: Array.from(new Set([dc, "USD", "EUR"])),
    },
  };
}

/** Admin GET masks saved secrets as `***`; PATCH must not persist that placeholder or wipe keys. */
function mergeSecretField(
  incoming: string | undefined | null,
  existing: string | null | undefined
): string | null {
  const t = typeof incoming === "string" ? incoming.trim() : "";
  if (!t || t === "***") return (existing && String(existing).trim()) || null;
  return t;
}

/**
 * GET /api/admin/settings
 *
 * Get platform settings
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);

    const supabase = getSupabaseAdmin();
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);
    const defaultSettings = await getTenantAwareDefaultPlatformSettings(request, currentTenantId);

    // Get latest platform_settings row (table has id, settings, is_active; no key/value)
    try {
      const scopedSettings = await fetchScopedSingle<{ id?: string; settings?: Record<string, unknown> }>({
        supabase,
        table: "platform_settings",
        tenantId: currentTenantId,
        select: "*",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      if (!scopedSettings.data) {
        return successResponse(defaultSettings, 200);
      }

      type SettingsRow = { id?: string; settings?: Record<string, unknown> };
      const settingsRow = scopedSettings.data as SettingsRow;
      if (settingsRow?.settings) {
        const merged = { ...settingsRow.settings } as unknown as PlatformSettings;
        merged.onesignal = {
          ...defaultSettings.onesignal,
          ...(merged.onesignal ?? ({} as PlatformSettings["onesignal"])),
        };
        try {
          const scopedSecrets = await fetchScopedSingle<Record<string, unknown>>({
            supabase,
            table: "platform_secrets",
            tenantId: currentTenantId,
            select:
              "paystack_secret_key, paystack_public_key, paystack_webhook_secret, onesignal_rest_api_key, onesignal_rest_api_key_provider, mapbox_access_token, amplitude_secret_key, google_calendar_client_id, google_calendar_client_secret, outlook_client_id, outlook_client_secret",
            apply: (q) => q,
            orderBy: { column: "updated_at", ascending: false },
          });
          const secretRow = scopedSecrets.data;

          if (secretRow?.paystack_secret_key) merged.paystack.secret_key = "***";
          if (secretRow?.paystack_public_key) merged.paystack.public_key = "***";
          if (secretRow?.paystack_webhook_secret) merged.paystack.webhook_secret = "***";
          if (secretRow?.onesignal_rest_api_key) merged.onesignal.rest_api_key = "***";
          if (secretRow?.onesignal_rest_api_key_provider)
            merged.onesignal.rest_api_key_provider = "***";
          if (secretRow?.mapbox_access_token) merged.mapbox.access_token = "***";
          if (secretRow?.amplitude_secret_key) merged.amplitude.secret_key = "***";
          if (secretRow?.google_calendar_client_id) merged.calendar_integrations.google.client_id = "***";
          if (secretRow?.google_calendar_client_secret) merged.calendar_integrations.google.client_secret = "***";
          if (secretRow?.outlook_client_id) merged.calendar_integrations.outlook.client_id = "***";
          if (secretRow?.outlook_client_secret) merged.calendar_integrations.outlook.client_secret = "***";
        } catch {
          // ignore (table may not exist yet in dev)
        }

        return successResponse(merged, 200);
      }
    } catch (error) {
      // Table might not exist, return default settings
      console.warn("Platform settings table may not exist, using defaults:", error);
    }

    return successResponse(defaultSettings, 200);
  } catch (error) {
    return handleApiError(error, "Failed to load settings");
  }
}

/**
 * PATCH /api/admin/settings
 * 
 * Update platform settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);

    const supabase = getSupabaseAdmin();
    const rawBody = (await request.json()) as Record<string, unknown>;
    const { scope: _scope, tenant_id: _tenantId, tenantId: _tenantIdAlt, ...rawSettingsPatch } = rawBody;
    const body = rawSettingsPatch as Partial<PlatformSettings>;
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(request, rawBody, user.role ?? null);
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    // Load existing settings and merge with defaults + body so partial payloads always validate
    type SettingsRow = { id?: string; settings?: Record<string, unknown> };
    let existingQuery = supabase
      .from("platform_settings")
      .select("id, settings")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    existingQuery =
      scopeTenantId == null ? existingQuery.is("tenant_id", null) : existingQuery.eq("tenant_id", scopeTenantId);
    const { data: existingRow } = await existingQuery.maybeSingle();

    let globalFallbackRow: SettingsRow | null = null;
    if (!existingRow && scopeTenantId != null) {
      const { data: globalRow } = await supabase
        .from("platform_settings")
        .select("id, settings")
        .eq("is_active", true)
        .is("tenant_id", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      globalFallbackRow = (globalRow as SettingsRow | null) ?? null;
    }

    const defaults = await getTenantAwareDefaultPlatformSettings(
      request,
      scopeTenantId ?? currentTenantId
    );
    const existing = (existingRow as SettingsRow | null)?.settings ?? globalFallbackRow?.settings ?? {};
    const settings: PlatformSettings = { ...defaults, ...existing, ...body } as PlatformSettings;

    // Validate required top-level sections after merge
    if (!settings.branding || !settings.localization || !settings.payouts || !settings.notifications || !settings.payment_types || !settings.paystack || !settings.onesignal || !settings.mapbox || !settings.amplitude || !settings.google || !settings.calendar_integrations || !settings.apps || !settings.features) {
      return errorResponse("Invalid settings structure: missing required section (branding, localization, payouts, notifications, payment_types, paystack, onesignal, mapbox, amplitude, google, calendar_integrations, apps, features)", "VALIDATION_ERROR", 400);
    }

    // Store sensitive secrets in platform_secrets (NOT in public platform_settings JSON)
    // NOTE: platform_settings has public-read policies in migrations, so secrets must not live there.
    const hasAnySecrets =
      !!settings.paystack.secret_key ||
      !!settings.paystack.public_key ||
      !!settings.paystack.webhook_secret ||
      !!settings.onesignal.rest_api_key ||
      !!settings.onesignal.rest_api_key_provider ||
      !!settings.mapbox.access_token ||
      !!settings.amplitude.secret_key ||
      !!settings.calendar_integrations.google.client_id ||
      !!settings.calendar_integrations.google.client_secret ||
      !!settings.calendar_integrations.outlook.client_id ||
      !!settings.calendar_integrations.outlook.client_secret;

    if (hasAnySecrets) {
      // Upsert singleton row
      let secretQuery = supabase
        .from("platform_secrets")
        .select(
          "id, paystack_secret_key, paystack_public_key, paystack_webhook_secret, onesignal_rest_api_key, onesignal_rest_api_key_provider, mapbox_access_token, amplitude_secret_key, google_calendar_client_id, google_calendar_client_secret, outlook_client_id, outlook_client_secret"
        )
        .order("updated_at", { ascending: false })
        .limit(1);
      secretQuery =
        scopeTenantId == null ? secretQuery.is("tenant_id", null) : secretQuery.eq("tenant_id", scopeTenantId);
      const { data: existingSecretRow } = await secretQuery.maybeSingle();
      const prev = existingSecretRow as Record<string, string | null | undefined> | null;

      const secretPayload: Record<string, unknown> = {
        tenant_id: scopeTenantId,
        paystack_secret_key: mergeSecretField(settings.paystack.secret_key, prev?.paystack_secret_key),
        paystack_public_key: mergeSecretField(settings.paystack.public_key, prev?.paystack_public_key),
        paystack_webhook_secret: mergeSecretField(
          settings.paystack.webhook_secret as string | undefined,
          prev?.paystack_webhook_secret
        ),
        onesignal_rest_api_key: mergeSecretField(settings.onesignal.rest_api_key, prev?.onesignal_rest_api_key),
        onesignal_rest_api_key_provider: mergeSecretField(
          settings.onesignal.rest_api_key_provider,
          prev?.onesignal_rest_api_key_provider
        ),
        mapbox_access_token: mergeSecretField(settings.mapbox.access_token, prev?.mapbox_access_token),
        amplitude_secret_key: mergeSecretField(settings.amplitude.secret_key, prev?.amplitude_secret_key),
        google_calendar_client_id: mergeSecretField(
          settings.calendar_integrations.google.client_id,
          prev?.google_calendar_client_id
        ),
        google_calendar_client_secret: mergeSecretField(
          settings.calendar_integrations.google.client_secret,
          prev?.google_calendar_client_secret
        ),
        outlook_client_id: mergeSecretField(
          settings.calendar_integrations.outlook.client_id,
          prev?.outlook_client_id
        ),
        outlook_client_secret: mergeSecretField(
          settings.calendar_integrations.outlook.client_secret,
          prev?.outlook_client_secret
        ),
        updated_at: new Date().toISOString(),
      };

      if (existingSecretRow?.id) {
        await supabase.from("platform_secrets").update(secretPayload).eq("id", existingSecretRow.id);
      } else {
        await supabase.from("platform_secrets").insert(secretPayload);
      }
    }
    // NOTE: process.env mutations do not persist reliably in serverless deployments.
    // Persist config via database instead.

    // Remove secrets before storing public settings JSON
    settings.paystack.secret_key = "";
    settings.paystack.public_key = "";
    settings.paystack.webhook_secret = undefined;
    settings.onesignal.rest_api_key = "";
    settings.onesignal.rest_api_key_provider = "";
    settings.mapbox.access_token = "";
    settings.amplitude.secret_key = undefined;
    settings.calendar_integrations.google.client_id = "";
    settings.calendar_integrations.google.client_secret = "";
    settings.calendar_integrations.outlook.client_id = "";
    settings.calendar_integrations.outlook.client_secret = "";

    const existingSettings = existingRow;

    const existingSettingsRow = existingSettings as SettingsRow | null;
    if (existingSettingsRow?.id) {
      const { data: updatedSettings, error: updateError } = await supabase
        .from("platform_settings")
        .update({
          tenant_id: scopeTenantId,
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingSettingsRow.id)
        .select()
        .single();

      if (updateError || !updatedSettings) {
        throw updateError || new Error("Failed to update settings");
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "superadmin",
        action: "admin.settings.update",
        entity_type: "platform_settings",
        entity_id: existingSettingsRow.id,
        metadata: {
          updated_at: new Date().toISOString(),
          has_secrets_update: hasAnySecrets,
          scope: requestedScope.scope,
          tenant_id: scopeTenantId,
        },
      });

      revalidateTag("platform-settings", "max");
      const updatedPayload = (updatedSettings as SettingsRow).settings as unknown as PlatformSettings;
      return successResponse(updatedPayload, 200);
    } else {
      const { data: newSettings, error: createError } = await supabase
        .from("platform_settings")
        .insert({
          tenant_id: scopeTenantId,
          settings,
        })
        .select()
        .single();

      if (createError || !newSettings) {
        throw createError || new Error("Failed to create settings");
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "superadmin",
        action: "admin.settings.create",
        entity_type: "platform_settings",
        entity_id: (newSettings as SettingsRow).id,
        metadata: {
          created_at: new Date().toISOString(),
          has_secrets_update: hasAnySecrets,
          scope: requestedScope.scope,
          tenant_id: scopeTenantId,
        },
      });

      revalidateTag("platform-settings", "max");
      const newPayload = (newSettings as SettingsRow).settings as unknown as PlatformSettings;
      return successResponse(newPayload, 200);
    }
  } catch (error) {
    return handleApiError(error, "Failed to save settings");
  }
}

