import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
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

/**
 * GET /api/admin/settings
 * 
 * Get platform settings
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();

    // Get settings from database, upsert defaults if not found
    const defaultSettings: PlatformSettings = {
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

    // Try to get from database, upsert defaults if not found
    try {
      const { data: settings, error: settingsError } = await (supabase
        .from("platform_settings") as any)
        .select("*")
        .single();

      // If no settings found, upsert defaults into the database
      if (settingsError || !settings) {
        const { data, error } = await (supabase
          .from("platform_settings") as any)
          .upsert(
            { key: "platform", value: defaultSettings, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          )
          .select()
          .single();

        if (error || !data) {
          // If upsert fails (e.g. table doesn't exist yet), return defaults
          return successResponse(defaultSettings);
        }

        return successResponse(defaultSettings);
      }

      if (settings && (settings as any).settings) {
        // Merge secret "configured" markers for superadmin UI
        const merged = { ...(settings as any).settings } as PlatformSettings;
        try {
          const { data: secretRow } = await (supabase.from("platform_secrets") as any)
            .select("paystack_secret_key, paystack_public_key, paystack_webhook_secret, onesignal_rest_api_key, mapbox_access_token, amplitude_secret_key, google_calendar_client_id, google_calendar_client_secret, outlook_client_id, outlook_client_secret")
            .limit(1)
            .maybeSingle();

          if (secretRow?.paystack_secret_key) merged.paystack.secret_key = "***";
          if (secretRow?.paystack_public_key) merged.paystack.public_key = "***";
          if (secretRow?.paystack_webhook_secret) merged.paystack.webhook_secret = "***" as any;
          if (secretRow?.onesignal_rest_api_key) merged.onesignal.rest_api_key = "***";
          if (secretRow?.mapbox_access_token) merged.mapbox.access_token = "***";
          if (secretRow?.amplitude_secret_key) merged.amplitude.secret_key = "***" as any;
          if (secretRow?.google_calendar_client_id) merged.calendar_integrations.google.client_id = "***";
          if (secretRow?.google_calendar_client_secret) merged.calendar_integrations.google.client_secret = "***";
          if (secretRow?.outlook_client_id) merged.calendar_integrations.outlook.client_id = "***";
          if (secretRow?.outlook_client_secret) merged.calendar_integrations.outlook.client_secret = "***";
        } catch {
          // ignore (table may not exist yet in dev)
        }

        return successResponse(merged);
      }
    } catch (error) {
      // Table might not exist, return default settings
      console.warn("Platform settings table may not exist, using defaults:", error);
    }

    return successResponse(defaultSettings);
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
    const { user } = await requireRoleInApi(['superadmin']);

    const supabase = await getSupabaseServer();
    const body = await request.json();
    const settings: PlatformSettings = body;

    // Validate settings structure
    if (!settings.branding || !settings.localization || !settings.payouts || !settings.notifications || !settings.payment_types || !settings.paystack || !settings.onesignal || !settings.mapbox || !settings.amplitude || !settings.google || !settings.calendar_integrations || !settings.apps || !settings.features) {
      return errorResponse("Invalid settings structure", "VALIDATION_ERROR", 400);
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
      const { data: existingSecretRow } = await (supabase.from("platform_secrets") as any)
        .select("id")
        .limit(1)
        .maybeSingle();

      const secretPayload: Record<string, any> = {
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
        await (supabase.from("platform_secrets") as any).update(secretPayload).eq("id", existingSecretRow.id);
      } else {
        await (supabase.from("platform_secrets") as any).insert(secretPayload);
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

    // Upsert settings (create or update)
    const { data: existingSettings } = await (supabase
      .from("platform_settings") as any)
      .select("id")
      .single();

    if (existingSettings) {
      // Update
      const { data: updatedSettings, error: updateError } = await (supabase
        .from("platform_settings") as any)
        .update({
          settings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existingSettings as any).id)
        .select()
        .single();

      if (updateError || !updatedSettings) {
        throw updateError || new Error("Failed to update settings");
      }

      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: (user as any).role || "superadmin",
        action: "admin.settings.update",
        entity_type: "platform_settings",
        entity_id: (existingSettings as any).id,
        metadata: {
          updated_at: new Date().toISOString(),
          has_secrets_update: hasAnySecrets,
        },
      });

      // Clear locale cache on client side (will be handled by revalidation)
      // In a real implementation, you might want to use a cache invalidation service
      
      return successResponse((updatedSettings as any).settings as PlatformSettings);
    } else {
      // Create
      const { data: newSettings, error: createError } = await (supabase
        .from("platform_settings") as any)
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
        actor_role: (user as any).role || "superadmin",
        action: "admin.settings.create",
        entity_type: "platform_settings",
        entity_id: (newSettings as any).id,
        metadata: {
          created_at: new Date().toISOString(),
          has_secrets_update: hasAnySecrets,
        },
      });

      return successResponse((newSettings as any).settings as PlatformSettings);
    }
  } catch (error) {
    return handleApiError(error, "Failed to save settings");
  }
}

