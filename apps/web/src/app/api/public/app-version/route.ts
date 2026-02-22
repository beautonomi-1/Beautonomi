import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform'); // 'ios' or 'android'
    const currentVersion = searchParams.get('version'); // Current app version

    if (!platform || !currentVersion) {
      return NextResponse.json(
        { error: 'Platform and version are required' },
        { status: 400 }
      );
    }

    // Fetch app version settings from Supabase
    const { data: versionSettings, error } = await supabase
      .from('app_version_settings')
      .select('*')
      .eq('platform', platform)
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
      });
    }

    const minVersion = versionSettings.min_version;
    const latestVersion = versionSettings.latest_version;
    const forceUpdate = versionSettings.force_update || false;
    const updateUrl = versionSettings.update_url;

    // Compare versions (simple string comparison, can be enhanced with semver)
    const requiresUpdate = compareVersions(currentVersion, minVersion) < 0;

    return NextResponse.json({
      requiresUpdate,
      forceUpdate: requiresUpdate && forceUpdate,
      minVersion,
      latestVersion,
      updateUrl,
      currentVersion,
      platform,
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
