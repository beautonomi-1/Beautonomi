import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/permissions/role?role=user_role
 * Get all permissions for a specific role
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    if (!role) {
      return NextResponse.json(
        { error: 'role parameter is required' },
        { status: 400 }
      );
    }

    // Fetch permissions for the role
    const { data: rolePermissions, error } = await supabase
      .from('role_permissions')
      .select(`
        permission_id,
        granted,
        permissions (*)
      `)
      .eq('role', role)
      .eq('granted', true);

    if (error) {
      console.error('Error fetching role permissions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch role permissions' },
        { status: 500 }
      );
    }

    // Extract permissions from the joined data
    const permissions = rolePermissions
      ?.map((rp: any) => rp.permissions)
      .filter((p: any) => p && p.enabled) || [];

    return NextResponse.json({ permissions }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
