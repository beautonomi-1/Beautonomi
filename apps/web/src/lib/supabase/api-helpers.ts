/**
 * Supabase API Helpers
 * 
 * Common utilities for API routes.
 * Supports Bearer token for mobile/Expo - pass request as second arg to requireRoleInApi.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseServer, createSupabaseClientFromToken } from "./server";
import { requireRole as requireRoleAuth } from '@/lib/auth/requireRole';
import type { UserRole } from '@/types/beautonomi';

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

/**
 * Create a successful API response
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    {
      data,
      error: null,
    },
    { status }
  );
}

/**
 * Create an error API response
 */
export function errorResponse(
  message: string,
  code?: string,
  status = 400,
  details?: unknown
) {
  return NextResponse.json<ApiResponse<null>>(
    {
      data: null,
      error: {
        message,
        code,
        details,
      },
    },
    { status }
  );
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return errorResponse(message, 'UNAUTHORIZED', 401);
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(message = 'Forbidden') {
  return errorResponse(message, 'FORBIDDEN', 403);
}

/**
 * Create a not found response
 */
export function notFoundResponse(message = 'Resource not found') {
  return errorResponse(message, 'NOT_FOUND', 404);
}

/** @deprecated Use errorResponse instead */
export function badRequestResponse(message: string) {
  return errorResponse(message, 'VALIDATION_ERROR', 400);
}

/**
 * Handle API route errors
 */
export function handleApiError(
  error: unknown,
  defaultMessage = "Internal server error",
  _codeOrStatus?: string | number,
  _statusCode?: number
) {
  console.error("API Error:", error);

  // Determine status code from arguments (backward compatibility)
  let status = typeof _codeOrStatus === "number" ? _codeOrStatus : (_statusCode ?? 500);
  let code = typeof _codeOrStatus === "string" ? _codeOrStatus : "INTERNAL_ERROR";

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorCause = (error as any).cause;

    // Check for network/timeout errors
    if (
      errorMessage.includes("network error") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connect") ||
      errorMessage.includes("fetch failed") ||
      (errorCause &&
        (errorCause.code === "UND_ERR_CONNECT_TIMEOUT" ||
          errorCause.code === "ECONNREFUSED" ||
          errorCause.code === "ETIMEDOUT"))
    ) {
      status = 503;
      code = "SERVICE_UNAVAILABLE";
      Sentry.captureException(error, { extra: { code, status } });
      return errorResponse(
        "Service temporarily unavailable. Please try again later.",
        code,
        status,
        process.env.NODE_ENV === "development" ? error.stack : undefined
      );
    }

    // Check for authentication/permission errors
    if (
      errorMessage.includes("insufficient permissions") ||
      errorMessage.includes("authentication required") ||
      errorMessage.includes("unauthorized")
    ) {
      status = 403;
      code = "FORBIDDEN";
    }

    Sentry.captureException(error, { extra: { code, status } });
    return errorResponse(
      error.message || defaultMessage,
      code,
      status,
      process.env.NODE_ENV === "development" ? error.stack : undefined
    );
  }

  Sentry.captureMessage(String(error), { level: "error", extra: { code, status } });
  return errorResponse(defaultMessage, code, status);
}

/**
 * Require authentication in API route
 */
export async function requireAuthInApi(request?: NextRequest | Request) {
  const supabase = await getSupabaseServer(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Authentication required');
  }
  
  return { user };
}

/**
 * Require role in API route.
 * Pass request as second arg for mobile/Expo Bearer token support.
 *
 * When 'superadmin' is in the allowed roles: superadmin bypasses provider scoping.
 * Routes must handle superadmin explicitly (e.g. accept provider_id query param for
 * cross-provider access). getProviderIdForUser returns null for superadmin.
 */
export async function requireRoleInApi(
  role: UserRole | UserRole[],
  request?: NextRequest | Request
) {
  const roles = Array.isArray(role) ? role : [role];

  // Mobile/Expo: try Bearer token first
  if (request) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      try {
        const supabase = createSupabaseClientFromToken(token);
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (error || !authUser) throw new Error("Authentication required");
        const { data: userData } = await supabase
          .from("users")
          .select("id, role, full_name")
          .eq("id", authUser.id)
          .single();
        if (!userData || !userData.role) throw new Error("User profile not found. Please contact support.");
        const userRole = userData.role as UserRole;
        if (!roles.includes(userRole))
          throw new Error(`Insufficient permissions: requires one of ${roles.join(", ")}`);
        return { user: { id: userData.id, role: userRole, email: authUser.email, user_metadata: authUser.user_metadata, full_name: userData.full_name } };
      } catch (err) {
        throw err;
      }
    }
  }

  try {
    const result = await requireRoleAuth(roles);
    
    if (!result) {
      // Check if it's a network error that was caught
      const supabase = await getSupabaseServer();
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      // If we can't get the auth user, it might be a network/auth issue
      if (authError || !authUser) {
        if (authError?.message?.toLowerCase().includes('timeout') || 
            authError?.message?.toLowerCase().includes('network') ||
            authError?.message?.toLowerCase().includes('connect')) {
          throw new Error(`Network error: ${authError.message}`);
        }
        throw new Error('Authentication required');
      }
      
      // Try to get the user's actual role for better error message
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single();
      
      const actualRole = userData?.role || 'none';
      console.error(`User ${authUser.id} has role '${actualRole}' but required one of: ${roles.join(', ')}`);
      
      // User is authenticated but doesn't have the required role
      throw new Error(`Insufficient permissions: User has role '${actualRole}' but requires one of: ${roles.join(', ')}`);
    }
    
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Authentication required');
    }
    
    // Return user object (session not needed, using getUser() for security)
    return { user: result.user };
  } catch (error) {
    // Re-throw network errors and other specific errors with their original message
    if (error instanceof Error && (
      error.message.startsWith('Network error:') ||
      error.message.startsWith('User profile not found') ||
      error.message.startsWith('User role not assigned') ||
      error.message.startsWith('Permission denied') ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('connect')
    )) {
      throw error;
    }
    // Re-throw other errors as-is
    throw error;
  }
}

/**
 * Get pagination parameters from request
 */
export function getPaginationParams(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    items,
    total,
    page,
    limit,
    has_more: total > page * limit,
  };
}

/**
 * Get provider ID for current user (works for both owners and staff)
 */
export async function getProviderIdForUser(
  userId: string,
  supabaseClient?: Awaited<ReturnType<typeof getSupabaseServer>>
): Promise<string | null> {
  const supabase = supabaseClient || await getSupabaseServer();
  
  // First check if user is a provider owner
  const { data: provider, error: providerError } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (providerError) {
    console.error('Error fetching provider ID for user:', providerError);
  }
  
  if (provider) {
    return provider.id;
  }
  
  // Check if user is provider staff
  const { data: staff, error: staffError } = await supabase
    .from('provider_staff')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  
  if (staffError) {
    console.error('Error fetching provider ID from staff:', staffError);
    return null;
  }
  
  if (staff) {
    return staff.provider_id;
  }
  
  return null;
}

/**
 * Check if user is provider owner or staff
 */
export async function isProviderUser(userId: string, providerId: string): Promise<boolean> {
  const supabase = await getSupabaseServer();
  
  // Check if user is provider owner
  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('id', providerId)
    .eq('user_id', userId)
    .single();
  
  if (provider) {
    return true;
  }
  
  // Check if user is provider staff
  const { data: staff } = await supabase
    .from('provider_staff')
    .select('id')
    .eq('provider_id', providerId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  
  return !!staff;
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Parse and validate date
 */
export function parseDate(dateString: string | null): Date | null {
  if (!dateString) return null;
  
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format date for database
 */
export function formatDateForDb(date: Date): string {
  return date.toISOString();
}

/**
 * Normalize phone number for Supabase Auth (without + prefix)
 * Validates phone number format but removes + prefix if present
 * Handles numbers starting with 0 by removing the 0 and using country code
 * 
 * @param phone - Phone number to normalize (can be with or without + prefix)
 * @param countryCode - Optional country code (e.g., "27" for South Africa) to use if phone starts with 0
 * @returns Normalized phone number without + prefix, or undefined if invalid
 */
export function normalizePhoneToE164(phone: string | null | undefined, countryCode?: string): string | undefined {
  if (!phone) {
    return undefined;
  }
  
  // Remove all spaces, dashes, parentheses, and other formatting
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
  
  if (!cleaned) {
    return undefined;
  }
  
  // Remove + prefix if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // If phone starts with 0 and we have a country code, remove the 0 and prepend country code
  if (cleaned.startsWith('0') && countryCode) {
    // Remove the leading 0
    cleaned = cleaned.substring(1);
    // Remove + from country code if present
    const cleanCountryCode = countryCode.replace(/^\+/, '');
    // Combine country code with phone number
    cleaned = cleanCountryCode + cleaned;
  }
  
  // Validate format: should start with 1-9 and have 8-15 digits total (E.164 standard)
  if (/^[1-9]\d{7,14}$/.test(cleaned)) {
    // Return with + prefix for E.164 compliance (required by Supabase Auth)
    return '+' + cleaned;
  }
  
  // Invalid format
  return undefined;
}
