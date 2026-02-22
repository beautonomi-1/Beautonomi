import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/permissions/check?role=user_role&permission=permission_key
 * Check if a role has a specific permission
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const permission = searchParams.get('permission');

    if (!role || !permission) {
      return NextResponse.json(
        { error: 'role and permission parameters are required' },
        { status: 400 }
      );
    }

    // Check permission using database function
    const { data, error } = await supabase.rpc('has_permission', {
      user_role: role,
      permission_key_param: permission,
    });

    if (error) {
      console.error('Error checking permission:', error);
      return NextResponse.json(
        { error: 'Failed to check permission' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { hasPermission: data ?? false },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
