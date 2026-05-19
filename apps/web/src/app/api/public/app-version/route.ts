import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

const VALID_PLATFORMS = ["ios", "android"] as const;

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform'); // 'ios' or 'android'
    const currentVersion = normalizeVersion(searchParams.get('version') ?? ''); // Optional: app sends from Constants.expoConfig?.version

    if (!platform || !VALID_PLATFORMS.includes(platform as (typeof VALID_PLATFORMS)[number])) {
      return NextResponse.json(
        { error: 'Platform is required (ios or android)' },
        { status: 400 }
      );
    }

    const platformKey = platform as "ios" | "android";

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
        ? normalizeVersion(versionSettings.min_version)
        : null;
    const latestVersion =
      typeof versionSettings.latest_version === "string" && versionSettings.latest_version.trim()
        ? normalizeVersion(versionSettings.latest_version)
        : null;
    const forceUpdate = versionSettings.force_update || false;
    const updateUrl =
      typeof versionSettings.update_url === "string" && versionSettings.update_url.trim()
        ? versionSettings.update_url.trim()
        : null;

    // Clients compare locally: if (data.forceUpdate && compareVersions(currentVersion, data.minVersion) < 0) → force; else compare to latestVersion for optional prompt.
    const hasVersion = currentVersion.length > 0;
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

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

// Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2.
function compareVersions(v1: string, v2: string): number {
  const parts1 = normalizeVersion(v1).split(/[+-]/)[0].split('.').map((part) => Number.parseInt(part, 10));
  const parts2 = normalizeVersion(v2).split(/[+-]/)[0].split('.').map((part) => Number.parseInt(part, 10));
  
  const maxLength = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLength; i++) {
    const part1 = Number.isFinite(parts1[i]) ? parts1[i] : 0;
    const part2 = Number.isFinite(parts2[i]) ? parts2[i] : 0;
    
    if (part1 < part2) return -1;
    if (part1 > part2) return 1;
  }
  
  return 0;
}
