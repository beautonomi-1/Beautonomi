/**
 * Staff Permissions Utilities
 * 
 * Handles permission checking for provider staff members
 */

import { getSupabaseServer } from '@/lib/supabase/server';

export interface StaffPermissions {
  view_calendar?: boolean;
  create_appointments?: boolean;
  edit_appointments?: boolean;
  cancel_appointments?: boolean;
  delete_appointments?: boolean;
  view_sales?: boolean;
  create_sales?: boolean;
  process_payments?: boolean;
  view_reports?: boolean;
  view_services?: boolean;
  edit_services?: boolean;
  view_products?: boolean;
  edit_products?: boolean;
  view_team?: boolean;
  manage_team?: boolean;
  view_settings?: boolean;
  edit_settings?: boolean;
  view_clients?: boolean;
  edit_clients?: boolean;
  view_reviews?: boolean;
  edit_reviews?: boolean;
  view_messages?: boolean;
  send_messages?: boolean;
  create_explore_posts?: boolean;
}

/**
 * Get staff member's permissions
 * 
 * Resolution order:
 * 1. Custom role (role_id) → provider_roles.permissions
 * 2. Direct permissions → provider_staff.permissions
 * 3. Default role permissions → get_default_permissions_for_role()
 */
export async function getStaffPermissions(
  userId: string,
  staffId?: string
): Promise<StaffPermissions> {
  const supabase = await getSupabaseServer();
  
  // Get provider ID
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (!provider) {
    // Check if user is staff member
    let staffQuery = supabase
      .from('provider_staff')
      .select('provider_id, role, permissions, role_id, is_admin')
      .eq('user_id', userId);
    
    if (staffId) {
      staffQuery = staffQuery.eq('id', staffId);
    }
    
    const { data: staff } = await staffQuery.single();
    
    if (!staff) {
      return {};
    }
    
    return resolvePermissions(supabase, staff);
  }
  
  // User is provider owner - get staff member if staffId provided
  if (staffId) {
    const { data: staff } = await supabase
      .from('provider_staff')
      .select('role, permissions, role_id, is_admin')
      .eq('id', staffId)
      .eq('provider_id', provider.id)
      .single();
    
    if (!staff) {
      return {};
    }
    
    return resolvePermissions(supabase, staff);
  }
  
  // Provider owner has all permissions
  return getAllPermissions();
}

/**
 * Resolve permissions for a staff member
 */
async function resolvePermissions(
  supabase: any,
  staff: { role: string; permissions?: any; role_id?: string | null; is_admin?: boolean }
): Promise<StaffPermissions> {
  // Owner or admin has all permissions
  if (staff.role === 'owner' || staff.is_admin) {
    return getAllPermissions();
  }
  
  // Check custom role first
  if (staff.role_id) {
    const { data: customRole } = await supabase
      .from('provider_roles')
      .select('permissions')
      .eq('id', staff.role_id)
      .single();
    
    if (customRole?.permissions) {
      const perms = typeof customRole.permissions === 'string'
        ? JSON.parse(customRole.permissions)
        : customRole.permissions;
      
      if (Object.keys(perms).length > 0) {
        return perms as StaffPermissions;
      }
    }
  }
  
  // Check direct permissions
  if (staff.permissions) {
    const perms = typeof staff.permissions === 'string'
      ? JSON.parse(staff.permissions)
      : staff.permissions;
    
    if (Object.keys(perms).length > 0) {
      return perms as StaffPermissions;
    }
  }
  
  // Fall back to default role permissions
  return getDefaultPermissionsForRole(staff.role);
}

/**
 * Check if staff has specific permission
 */
export async function hasPermission(
  userId: string,
  permission: keyof StaffPermissions,
  staffId?: string
): Promise<boolean> {
  const permissions = await getStaffPermissions(userId, staffId);
  return permissions[permission] === true;
}

/**
 * Get default permissions for role
 */
function getDefaultPermissionsForRole(role: string): StaffPermissions {
  switch (role) {
    case 'owner':
      return getAllPermissions();
    case 'manager':
      return {
        view_calendar: true,
        create_appointments: true,
        edit_appointments: true,
        cancel_appointments: true,
        delete_appointments: false,
        view_sales: true,
        create_sales: true,
        process_payments: true,
        view_reports: true,
        view_services: true,
        edit_services: true,
        view_products: true,
        edit_products: true,
        view_team: true,
        manage_team: false, // Managers can't manage team
        view_settings: true,
        edit_settings: false, // Managers can't edit settings
        view_clients: true,
        edit_clients: true,
        view_reviews: true,
        edit_reviews: true,
        view_messages: true,
        send_messages: true,
        create_explore_posts: true,
      };
    case 'employee':
      return {
        view_calendar: true,
        create_appointments: true,
        edit_appointments: false, // Can only edit own
        cancel_appointments: false, // Can only cancel own
        delete_appointments: false,
        view_sales: true,
        create_sales: false,
        process_payments: false,
        view_reports: false,
        view_services: true,
        edit_services: false,
        view_products: true,
        edit_products: false,
        view_team: false,
        manage_team: false,
        view_settings: false,
        edit_settings: false,
        view_clients: true,
        edit_clients: false,
        view_reviews: true,
        edit_reviews: false,
        view_messages: true,
        send_messages: true,
      };
    default:
      return {};
  }
}

/**
 * Get all permissions (for owner/admin)
 */
function getAllPermissions(): StaffPermissions {
  return {
    view_calendar: true,
    create_appointments: true,
    edit_appointments: true,
    cancel_appointments: true,
    delete_appointments: true,
    view_sales: true,
    create_sales: true,
    process_payments: true,
    view_reports: true,
    view_services: true,
    edit_services: true,
    view_products: true,
    edit_products: true,
    view_team: true,
    manage_team: true,
    view_settings: true,
    edit_settings: true,
    view_clients: true,
    edit_clients: true,
    view_reviews: true,
    edit_reviews: true,
    view_messages: true,
    send_messages: true,
    create_explore_posts: true,
  };
}

/**
 * Check if user is provider owner
 */
export async function isProviderOwner(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServer();
  
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  return !!provider;
}

/**
 * Get staff member record for user
 */
export async function getStaffMember(userId: string): Promise<{
  id: string;
  provider_id: string;
  role: string;
  is_admin: boolean;
} | null> {
  const supabase = await getSupabaseServer();
  
  const { data: staff } = await supabase
    .from('provider_staff')
    .select('id, provider_id, role, is_admin')
    .eq('user_id', userId)
    .single();
  
  return staff || null;
}
