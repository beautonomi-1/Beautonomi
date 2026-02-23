import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
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

/**
 * GET /api/admin/app-version
 * 
 * Get app version settings
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const { data: versionSettings, error } = await (supabase
      .from('app_version_settings') as any)
      .select('*');

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

    // Transform data to match expected structure
    const iosSettings = (versionSettings as any[])?.find((s: any) => s.platform === 'ios') || {
      platform: 'ios',
      min_version: '1.0.0',
      latest_version: '1.0.0',
      force_update: false,
      update_url: 'https://apps.apple.com/app/beautonomi',
    };

    const androidSettings = (versionSettings as any[])?.find((s: any) => s.platform === 'android') || {
      platform: 'android',
      min_version: '1.0.0',
      latest_version: '1.0.0',
      force_update: false,
      update_url: 'https://play.google.com/store/apps/details?id=com.beautonomi',
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
    await requireRoleInApi(['superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const { ios, android } = versionSettingsSchema.parse(body);

    // Upsert iOS settings
    const { error: iosError } = await (supabase
      .from('app_version_settings') as any)
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

    // Upsert Android settings
    const { error: androidError } = await (supabase
      .from('app_version_settings') as any)
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

    // Return updated settings
    const { data: updatedSettings } = await (supabase
      .from('app_version_settings') as any)
      .select('*');

    const updatedIos = (updatedSettings as any[])?.find((s: any) => s.platform === 'ios') || ios;
    const updatedAndroid = (updatedSettings as any[])?.find((s: any) => s.platform === 'android') || android;

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
