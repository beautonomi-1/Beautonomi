/**
 * Server-side role requirement helper
 * 
 * Use this in API routes and server components to check user roles.
 */

import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/beautonomi";
import type { UsersRoleFromDb } from "@/lib/auth/role";
import { NextResponse } from "next/server";

export interface RequireRoleOptions {
  allowedRoles: UsersRoleFromDb[];
  redirectTo?: string;
}

function getErrorCause(err: unknown): { code?: string } | undefined {
  if (err && typeof err === "object" && "cause" in err) {
    const cause = (err as { cause?: unknown }).cause;
    return cause && typeof cause === "object" && "code" in cause ? (cause as { code?: string }) : undefined;
  }
  return undefined;
}

/**
 * Requires user to have one of the allowed roles
 * 
 * @param allowedRoles - Array of roles that are allowed
 * @returns User object if authorized, null if not
 * @throws Redirects to login if not authenticated
 */
export async function requireRole(
  allowedRoles: UsersRoleFromDb[],
  /** When set (e.g. mobile `Authorization: Bearer`), resolves the session from the token instead of cookies only. */
  request?: Pick<Request, "headers">,
): Promise<{ user: { id: string; role: UsersRoleFromDb; email?: string; user_metadata?: Record<string, unknown>; full_name?: string | null } } | null> {
  const supabase = await getSupabaseServer(request);

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
        const errorCause = getErrorCause(userError);
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
        const errorCause = getErrorCause(userDataError);
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

    type UserRow = { id: string; role: string | null; full_name: string | null };
    const u = userData as UserRow;
    const userRole = u.role as UsersRoleFromDb;

    if (!userRole) {
      console.error(`User ${authUser.id} has no role assigned in users table`);
      throw new Error('User role not assigned. Please contact support.');
    }

    // Align with requireRoleInApi Bearer path: business owner may still have users.role = customer
    // (OAuth / web cookie session before /api/me/role persists provider_owner).
    let effectiveRole = userRole;
    if (
      effectiveRole === "customer" &&
      (allowedRoles.includes("provider_owner") || allowedRoles.includes("provider_staff"))
    ) {
      const admin = getSupabaseAdmin();
      const { data: ownsProvider } = await admin
        .from("providers")
        .select("id")
        .eq("user_id", u.id)
        .limit(1)
        .maybeSingle();
      if (ownsProvider) {
        effectiveRole = "provider_owner";
        await admin.from("users").update({ role: "provider_owner" }).eq("id", u.id);
      }
    }

    const routeAcceptsProviderOnboarding =
      effectiveRole === "provider_onboarding" &&
      allowedRoles.some((r) =>
        ["customer", "provider_owner", "provider_staff"].includes(r as string)
      );
    const roleAllowed =
      allowedRoles.includes(effectiveRole) || routeAcceptsProviderOnboarding;

    if (!roleAllowed) {
      console.error(
        `User ${authUser.id} has role '${effectiveRole}' but required one of: ${allowedRoles.join(", ")}`
      );
      return null;
    }

    return {
      user: {
        id: u.id,
        role: effectiveRole,
        email: authUser.email,
        user_metadata: authUser.user_metadata as Record<string, unknown> | undefined,
        full_name: u.full_name,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorCause = getErrorCause(error);
      
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
