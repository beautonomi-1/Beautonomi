/**
 * Permissions Utility
 * Functions to check user permissions
 */

export interface Permission {
  id: string;
  permission_key: string;
  permission_name: string;
  description: string | null;
  resource_type: string | null;
  action: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Check if a user has a permission (client-side)
 * @param userRole - The user's role
 * @param permissionKey - The permission key to check
 * @returns Promise<boolean>
 */
export async function hasPermission(
  userRole: string,
  permissionKey: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/permissions/check?role=${encodeURIComponent(userRole)}&permission=${encodeURIComponent(permissionKey)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      console.warn(`Failed to check permission: ${permissionKey}`);
      return false;
    }

    const data = await response.json();
    return data.hasPermission ?? false;
  } catch (error) {
    console.error(`Error checking permission ${permissionKey}:`, error);
    return false;
  }
}

/**
 * Get all permissions for a role (client-side)
 * @param role - The role to get permissions for
 * @returns Promise<Permission[]>
 */
export async function getRolePermissions(role: string): Promise<Permission[]> {
  try {
    const response = await fetch(
      `/api/permissions/role?role=${encodeURIComponent(role)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch role permissions');
    }

    const data = await response.json();
    return data.permissions ?? [];
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    throw error;
  }
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  // Admin permissions
  ADMIN_FULL_ACCESS: 'admin:full_access',
  ADMIN_VIEW_DASHBOARD: 'admin:view_dashboard',
  ADMIN_MANAGE_USERS: 'admin:manage_users',
  ADMIN_MANAGE_PROVIDERS: 'admin:manage_providers',
  ADMIN_MANAGE_BOOKINGS: 'admin:manage_bookings',
  ADMIN_MANAGE_SETTINGS: 'admin:manage_settings',
  ADMIN_MANAGE_FEATURE_FLAGS: 'admin:manage_feature_flags',
  ADMIN_VIEW_REPORTS: 'admin:view_reports',
  ADMIN_MANAGE_FINANCE: 'admin:manage_finance',
  
  // Provider permissions
  PROVIDER_MANAGE_SERVICES: 'provider:manage_services',
  PROVIDER_MANAGE_STAFF: 'provider:manage_staff',
  PROVIDER_VIEW_BOOKINGS: 'provider:view_bookings',
  
  // User permissions
  USER_CREATE_BOOKING: 'user:create_booking',
  USER_MANAGE_PROFILE: 'user:manage_profile',
} as const;

/**
 * Feature flag constants for easy reference
 */
export const FEATURE_FLAGS = {
  BOOKING_ONLINE: 'booking_online',
  BOOKING_AT_HOME: 'booking_at_home',
  BOOKING_GROUP: 'booking_group',
  PAYMENT_STRIPE: 'payment_stripe',
  PAYMENT_WALLET: 'payment_wallet',
  NOTIFICATIONS_EMAIL: 'notifications_email',
  NOTIFICATIONS_SMS: 'notifications_sms',
  NOTIFICATIONS_PUSH: 'notifications_push',
  REPORTS_EXPORT: 'reports_export',
  REPORTS_ANALYTICS: 'reports_analytics',
  PROVIDER_VERIFICATION: 'provider_verification',
  STAFF_TIME_TRACKING: 'staff_time_tracking',
  LOYALTY_PROGRAM: 'loyalty_program',
  REFERRAL_PROGRAM: 'referral_program',
  GIFT_CARDS: 'gift_cards',
  REVIEWS_RATINGS: 'reviews_ratings',
  QR_CODES: 'qr_codes',
  WAITLIST: 'waitlist',
  FREELANCER_MODE: 'freelancer_mode',
  ONDEMAND_SERVICES: 'ondemand_services',
} as const;
