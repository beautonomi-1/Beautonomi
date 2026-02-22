/**
 * Server-side role requirement helper
 * 
 * Use this in API routes and server components to check user roles.
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import type { UserRole } from "@/types/beautonomi";
import { NextResponse } from "next/server";

export interface RequireRoleOptions {
  allowedRoles: UserRole[];
  redirectTo?: string;
}

/**
 * Requires user to have one of the allowed roles
 * 
 * @param allowedRoles - Array of roles that are allowed
 * @returns User object if authorized, null if not
 * @throws Redirects to login if not authenticated
 */
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<{ user: { id: string; role: UserRole; email?: string; user_metadata?: any; full_name?: string | null } } | null> {
  const supabase = await getSupabaseServer();

  try {
    // Get authenticated user (validates with Supabase Auth server)
    const {
      data: { user: authUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !authUser) {
      // Check if it's a network/timeout error
      if (userError) {
        const errorMessage = userError.message?.toLowerCase() || '';
        const errorCause = (userError as any).cause;
        if (
          errorMessage.includes('timeout') ||
          errorMessage.includes('connect') ||
          errorMessage.includes('network') ||
          (errorCause && (
            errorCause.code === 'UND_ERR_CONNECT_TIMEOUT' ||
            errorCause.code === 'ECONNREFUSED' ||
            errorCause.code === 'ETIMEDOUT'
          ))
        ) {
          throw new Error(`Network error: ${userError.message}`);
        }
      }
      return null;
    }

    // Get user profile
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('id, role, full_name')
      .eq('id', authUser.id)
      .single();

    if (userDataError || !userData) {
      // Check if it's a network/timeout error
      if (userDataError) {
        const errorMessage = userDataError.message?.toLowerCase() || '';
        const errorCause = (userDataError as any).cause;
        const errorCode = userDataError.code || '';
        
        // Log the error for debugging
        console.error('Error fetching user data:', {
          code: errorCode,
          message: userDataError.message,
          details: userDataError.details,
          hint: userDataError.hint,
          userId: authUser.id
        });
        
        if (
          errorMessage.includes('timeout') ||
          errorMessage.includes('connect') ||
          errorMessage.includes('network') ||
          (errorCause && (
            errorCause.code === 'UND_ERR_CONNECT_TIMEOUT' ||
            errorCause.code === 'ECONNREFUSED' ||
            errorCause.code === 'ETIMEDOUT'
          ))
        ) {
          throw new Error(`Network error: ${userDataError.message}`);
        }
        
        // Check if user doesn't exist in users table (PGRST116)
        if (errorCode === 'PGRST116' || errorMessage.includes('no rows')) {
          console.error(`User ${authUser.id} exists in auth but not in users table`);
          throw new Error('User profile not found. Please contact support.');
        }
        
        // Check for RLS/permission errors
        if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('policy')) {
          console.error(`RLS policy blocking access to user ${authUser.id}`);
          throw new Error('Permission denied: Unable to access user profile');
        }
      } else if (!userData) {
        // No error but no data - user doesn't exist in users table
        console.error(`User ${authUser.id} exists in auth but not in users table (no error returned)`);
        throw new Error('User profile not found. Please contact support.');
      }
      return null;
    }

    const userRole = (userData as any).role as UserRole;
    
    // Check if role is null or undefined
    if (!userRole) {
      console.error(`User ${authUser.id} has no role assigned in users table`);
      throw new Error('User role not assigned. Please contact support.');
    }

    // Check if user has required role
    if (!allowedRoles.includes(userRole)) {
      console.error(`User ${authUser.id} has role '${userRole}' but required one of: ${allowedRoles.join(', ')}`);
      return null;
    }

    return {
      user: {
        id: (userData as any).id,
        role: userRole,
        email: authUser.email,
        user_metadata: authUser.user_metadata,
        full_name: (userData as any).full_name,
      },
    };
  } catch (error) {
    // Handle network errors and timeouts
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorCause = (error as any).cause;
      
      // Check for network/timeout errors
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('connect') ||
        errorMessage.includes('fetch failed') ||
        (errorCause && (
          errorCause.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          errorCause.code === 'ECONNREFUSED' ||
          errorCause.code === 'ETIMEDOUT'
        ))
      ) {
        // Re-throw network errors so they can be handled differently
        throw new Error(`Network error: ${error.message}`);
      }
    }
    // For other errors, return null (treat as auth failure)
    return null;
  }
}

/**
 * Creates a NextResponse error for unauthorized access
 */
export function unauthorizedResponse(message: string = "Unauthorized") {
  return NextResponse.json(
    { error: { message, code: "UNAUTHORIZED" } },
    { status: 401 }
  );
}

/**
 * Creates a NextResponse error for forbidden access (wrong role)
 */
export function forbiddenResponse(message: string = "Forbidden") {
  return NextResponse.json(
    { error: { message, code: "FORBIDDEN" } },
    { status: 403 }
  );
}
