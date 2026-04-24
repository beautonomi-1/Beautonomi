import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform'); // 'ios' or 'android'
    const currentVersion = searchParams.get('version') ?? ''; // Optional: app sends from Constants.expoConfig?.version

    if (!platform) {
      return NextResponse.json(
        { error: 'Platform is required (ios or android)' },
        { status: 400 }
      );
    }

    // Normalize platform for DB (Expo sends "ios" | "android")
    const platformKey = platform === 'ios' || platform === 'android' ? platform : 'ios';

    const appParam = searchParams.get('app');
    const appKey = appParam === 'provider' ? 'provider' : 'customer';

    const { data: versionSettings, error } = await supabase
      .from('app_version_settings')
      .select('*')
      .eq('app', appKey)
      .eq('platform', platformKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching version settings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch version settings' },
        { status: 500 }
      );
    }

    // If no settings found, return no update required
    if (!versionSettings) {
      return NextResponse.json({
        requiresUpdate: false,
        forceUpdate: false,
        minVersion: null,
        latestVersion: null,
        updateUrl: null,
        ...(currentVersion && { currentVersion: currentVersion, platform: platformKey }),
      });
    }

    const minVersion =
      typeof versionSettings.min_version === "string" && versionSettings.min_version.trim()
        ? versionSettings.min_version.trim()
        : null;
    const latestVersion =
      typeof versionSettings.latest_version === "string" && versionSettings.latest_version.trim()
        ? versionSettings.latest_version.trim()
        : null;
    const forceUpdate = versionSettings.force_update || false;
    const updateUrl =
      typeof versionSettings.update_url === "string" && versionSettings.update_url.trim()
        ? versionSettings.update_url.trim()
        : null;

    // Clients compare locally: if (data.forceUpdate && compareVersions(currentVersion, data.minVersion) < 0) → force; else compare to latestVersion for optional prompt.
    const hasVersion = currentVersion && currentVersion.trim().length > 0;
    const requiresUpdate =
      hasVersion && minVersion ? compareVersions(currentVersion, minVersion) < 0 : false;

    return NextResponse.json({
      requiresUpdate,
      forceUpdate: forceUpdate, // Policy from admin: "require update when below min"
      minVersion,
      latestVersion,
      updateUrl,
      app: appKey,
      ...(hasVersion && { currentVersion: currentVersion, platform: platformKey }),
    });
  } catch (error) {
    console.error('Error in app-version route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Simple version comparison function
// Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}
