import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";

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
    rest_api_key: string;
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
        favicon_url: "/favicon.ico",
        primary_color: "#FF0077",
        secondary_color: "#D60565",
      },
      localization: {
        default_language: "en",
        supported_languages: ["en", "af", "zu"],
        default_currency: "ZAR",
        supported_currencies: ["ZAR", "USD", "EUR"],
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
        cash: true,
        card: true,
        mobile: true,
        gift_card: false,
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

/**
 * GET /api/admin/settings
 *
 * Get platform settings
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);

    const supabase = getSupabaseAdmin();
    const defaultSettings = getDefaultPlatformSettings();

    // Get latest platform_settings row (table has id, settings, is_active; no key/value)
    try {
      const { data: settings, error: settingsError } = await supabase
        .from("platform_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (settingsError || !settings) {
        return successResponse(defaultSettings, 200);
      }

      type SettingsRow = { id?: string; settings?: Record<string, unknown> };
      const settingsRow = settings as SettingsRow | null;
      if (settingsRow?.settings) {
        const merged = { ...settingsRow.settings } as unknown as PlatformSettings;
        try {
          const { data: secretRow } = await supabase.from("platform_secrets")
            .select("paystack_secret_key, paystack_public_key, paystack_webhook_secret, onesignal_rest_api_key, mapbox_access_token, amplitude_secret_key, google_calendar_client_id, google_calendar_client_secret, outlook_client_id, outlook_client_secret")
            .limit(1)
            .maybeSingle();

          if (secretRow?.paystack_secret_key) merged.paystack.secret_key = "***";
          if (secretRow?.paystack_public_key) merged.paystack.public_key = "***";
          if (secretRow?.paystack_webhook_secret) merged.paystack.webhook_secret = "***";
          if (secretRow?.onesignal_rest_api_key) merged.onesignal.rest_api_key = "***";
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
    const body = (await request.json()) as Partial<PlatformSettings>;

    // Load existing settings and merge with defaults + body so partial payloads always validate
    type SettingsRow = { id?: string; settings?: Record<string, unknown> };
    const { data: existingRow } = await supabase
      .from("platform_settings")
      .select("id, settings")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const defaults = getDefaultPlatformSettings();
    const existing = (existingRow as SettingsRow | null)?.settings ?? {};
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
      !!settings.mapbox.access_token ||
      !!settings.amplitude.secret_key ||
      !!settings.calendar_integrations.google.client_id ||
      !!settings.calendar_integrations.google.client_secret ||
      !!settings.calendar_integrations.outlook.client_id ||
      !!settings.calendar_integrations.outlook.client_secret;

    if (hasAnySecrets) {
      // Upsert singleton row
      const { data: existingSecretRow } = await supabase.from("platform_secrets")
        .select("id")
        .limit(1)
        .maybeSingle();

      const secretPayload: Record<string, unknown> = {
        paystack_secret_key: settings.paystack.secret_key || null,
        paystack_public_key: settings.paystack.public_key || null,
        paystack_webhook_secret: settings.paystack.webhook_secret || null,
        onesignal_rest_api_key: settings.onesignal.rest_api_key || null,
        mapbox_access_token: settings.mapbox.access_token || null,
        amplitude_secret_key: settings.amplitude.secret_key || null,
        google_calendar_client_id: settings.calendar_integrations.google.client_id || null,
        google_calendar_client_secret: settings.calendar_integrations.google.client_secret || null,
        outlook_client_id: settings.calendar_integrations.outlook.client_id || null,
        outlook_client_secret: settings.calendar_integrations.outlook.client_secret || null,
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
        },
      });

      revalidateTag("platform-settings", "max");
      const updatedPayload = (updatedSettings as SettingsRow).settings as unknown as PlatformSettings;
      return successResponse(updatedPayload, 200);
    } else {
      const { data: newSettings, error: createError } = await supabase
        .from("platform_settings")
        .insert({
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

