import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { z } from 'zod';

const versionSettingsSchema = z.object({
  ios: z.object({
    min_version: z.string(),
    latest_version: z.string(),
    force_update: z.boolean().optional(),
    update_url: z.string().url(),
  }),
  android: z.object({
    min_version: z.string(),
    latest_version: z.string(),
    force_update: z.boolean().optional(),
    update_url: z.string().url(),
  }),
});

type AppVersionSettingRow = {
  platform?: string;
  min_version?: string;
  latest_version?: string;
  force_update?: boolean;
  update_url?: string;
};

/**
 * GET /api/admin/app-version
 * 
 * Get app version settings
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = await getSupabaseServer(request);

    const { data: versionSettings, error } = await supabase
      .from("app_version_settings")
      .select("*");

    if (error) {
      // Return default structure if table doesn't exist yet
      return successResponse({
        ios: {
          min_version: '1.0.0',
          latest_version: '1.0.0',
          force_update: false,
          update_url: 'https://apps.apple.com/app/beautonomi',
        },
        android: {
          min_version: '1.0.0',
          latest_version: '1.0.0',
          force_update: false,
          update_url: 'https://play.google.com/store/apps/details?id=com.beautonomi',
        },
      });
    }

    const settings = (versionSettings ?? []) as AppVersionSettingRow[];
    const iosSettings = settings.find((s) => s.platform === "ios") ?? {
      platform: "ios",
      min_version: "1.0.0",
      latest_version: "1.0.0",
      force_update: false,
      update_url: "https://apps.apple.com/app/beautonomi",
    };

    const androidSettings = settings.find((s) => s.platform === "android") ?? {
      platform: "android",
      min_version: "1.0.0",
      latest_version: "1.0.0",
      force_update: false,
      update_url: "https://play.google.com/store/apps/details?id=com.beautonomi",
    };

    return successResponse({
      ios: {
        min_version: iosSettings.min_version,
        latest_version: iosSettings.latest_version,
        force_update: iosSettings.force_update || false,
        update_url: iosSettings.update_url,
      },
      android: {
        min_version: androidSettings.min_version,
        latest_version: androidSettings.latest_version,
        force_update: androidSettings.force_update || false,
        update_url: androidSettings.update_url,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch app version settings');
  }
}

/**
 * PATCH /api/admin/app-version
 * 
 * Update app version settings
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { ios, android } = versionSettingsSchema.parse(body);

    const { error: iosError } = await supabase
      .from("app_version_settings")
      .upsert(
        {
          platform: 'ios',
          min_version: ios.min_version,
          latest_version: ios.latest_version,
          force_update: ios.force_update || false,
          update_url: ios.update_url,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'platform',
        }
      );

    if (iosError) {
      throw iosError;
    }

    const { error: androidError } = await supabase
      .from("app_version_settings")
      .upsert(
        {
          platform: 'android',
          min_version: android.min_version,
          latest_version: android.latest_version,
          force_update: android.force_update || false,
          update_url: android.update_url,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'platform',
        }
      );

    if (androidError) {
      throw androidError;
    }

    const { data: updatedSettings } = await supabase
      .from("app_version_settings")
      .select("*");

    const updatedRows = (updatedSettings ?? []) as AppVersionSettingRow[];
    const updatedIos = updatedRows.find((s) => s.platform === "ios") ?? ios;
    const updatedAndroid = updatedRows.find((s) => s.platform === "android") ?? android;

    return successResponse({
      ios: {
        min_version: updatedIos.min_version,
        latest_version: updatedIos.latest_version,
        force_update: updatedIos.force_update || false,
        update_url: updatedIos.update_url,
      },
      android: {
        min_version: updatedAndroid.min_version,
        latest_version: updatedAndroid.latest_version,
        force_update: updatedAndroid.force_update || false,
        update_url: updatedAndroid.update_url,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map(e => e.message).join(', ')),
        'Validation failed'
      );
    }
    return handleApiError(error, 'Failed to update app version settings');
  }
}
