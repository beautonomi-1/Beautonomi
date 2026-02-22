/**
 * Supabase Authentication Helpers (Server-Side Only)
 * 
 * Server-side authentication functions that use getSupabaseServer.
 * These functions can only be used in Server Components, API routes, and Server Actions.
 */

import { getSupabaseServer } from './server';
import type { UserRole } from '@/types/beautonomi';

/**
 * Get current session (server-side)
 * 
 * Note: This function uses getUser() for authentication validation,
 * then retrieves the session for backward compatibility.
 * For authentication checks, prefer getCurrentUserServer().
 * 
 * WARNING: getSession() is less secure than getUser() because it reads from storage
 * without validating with the auth server. Only use this if you need session-specific
 * data that isn't available from getUser().
 */
export async function getSessionServer() {
  const supabase = await getSupabaseServer();
  
  // First validate user authentication using getUser() (secure)
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return null;
  }
  
  // Then get session for backward compatibility (only if user is authenticated)
  // This is safe because we've already validated with getUser()
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

/**
 * Get current user (server-side)
 */
export async function getCurrentUserServer() {
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  return user;
}

/**
 * Get user role from database
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.role as UserRole;
}

/**
 * Check if user has required role
 */
export async function hasRole(
  userId: string,
  requiredRole: UserRole | UserRole[]
): Promise<boolean> {
  const userRole = await getUserRole(userId);
  
  if (!userRole) {
    return false;
  }

  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(userRole);
  }

  // Role hierarchy: superadmin > support_agent > provider_owner > provider_staff > customer
  const roleHierarchy: Record<UserRole, number> = {
    superadmin: 5,
    support_agent: 4,
    provider_owner: 3,
    provider_staff: 2,
    customer: 1,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Require authentication (throws if not authenticated)
 * Uses getUser() for secure authentication validation
 */
export async function requireAuth() {
  const user = await getCurrentUserServer();
  
  if (!user) {
    throw new Error('Authentication required');
  }

  return { user };
}

/**
 * Require role (throws if user doesn't have required role)
 * Uses getUser() for secure authentication validation
 */
export async function requireRole(requiredRole: UserRole | UserRole[]) {
  const { user } = await requireAuth();
  const hasRequiredRole = await hasRole(user.id, requiredRole);

  if (!hasRequiredRole) {
    throw new Error('Insufficient permissions');
  }

  return { user };
}

/**
 * Update user profile (server-side)
 */
export async function updateUserProfile(
  userId: string,
  updates: {
    full_name?: string;
    phone?: string;
    avatar_url?: string;
  }
) {
  const supabase = await getSupabaseServer();
  
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
}
