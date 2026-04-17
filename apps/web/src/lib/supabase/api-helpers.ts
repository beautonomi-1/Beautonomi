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
import { getSupabaseAdmin } from "./admin";
import { requireRole as requireRoleAuth } from '@/lib/auth/requireRole';
import type { UserRole } from '@/types/beautonomi';
import {
  ALL_ADMIN_ROLES,
  ADMIN_SECTION_ROLES,
  ALL_SECTIONS,
  canAccessSection,
  type AdminSection,
} from '@/lib/admin-sections';
import { resolveAdminApiTenantId } from '@/lib/tenant/admin-request-tenant';

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

/**
 * Create a successful API response
 */
export function successResponse<T>(data: T, status: number = 200) {
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
  details?: any
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
function isClientDisconnectError(error: any): boolean {
  if (!error) return false;
  const msg = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const code = (error as NodeJS.ErrnoException).code ?? (error.cause as any)?.code;
  if (msg.includes("aborted") || code === "ECONNRESET" || code === "EPIPE") return true;
  if (error instanceof SyntaxError && msg.includes("json")) return true; // truncated/empty body when client aborted
  return false;
}

export function handleApiError(
  error: any,
  defaultMessage = "Internal server error",
  _codeOrStatus?: string | number,
  _statusCode?: number
) {
  if (!isClientDisconnectError(error)) {
    console.error("API Error:", error);
  }

  // Determine status code from arguments (backward compatibility)
  let status = typeof _codeOrStatus === "number" ? _codeOrStatus : (_statusCode ?? 500);
  let code = typeof _codeOrStatus === "string" ? _codeOrStatus : "INTERNAL_ERROR";

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorCause =
      "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause
        ? (error.cause as { code?: string })
        : undefined;

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

    Sentry.captureException(error, { extra: { code, status, originalMessage: error.message } });
    // In production, never surface raw DB/internal error messages to clients on 5xx responses.
    // 4xx errors use error.message since they are intentionally user-facing (validation, auth, etc.).
    const clientMessage =
      status >= 500
        ? defaultMessage
        : error.message || defaultMessage;
    return errorResponse(
      clientMessage,
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

        // Self-heal: if public.users row is missing or has no role (trigger may not have run,
        // e.g. for phone-only signups or users created before the trigger was deployed),
        // create it now with admin privileges so the user can authenticate immediately.
        let resolvedUserData = userData;
        if (!userData || !userData.role) {
          const admin = getSupabaseAdmin();
          const placeholderEmail = authUser.email ?? `${authUser.id}@phone.local`;
          const { data: upserted } = await admin
            .from("users")
            .upsert(
              {
                id: authUser.id,
                email: placeholderEmail,
                full_name:
                  (authUser.user_metadata?.full_name as string | undefined) ??
                  (authUser.user_metadata?.name as string | undefined) ??
                  null,
                phone: (authUser.user_metadata?.phone as string | undefined) ?? null,
                role: "customer" as UserRole,
              },
              { onConflict: "id" }
            )
            .select("id, role, full_name")
            .single();
          if (!upserted || !upserted.role) throw new Error("User profile not found. Please contact support.");
          resolvedUserData = upserted;
          // Also ensure the wallet exists for this newly-created row.
          await admin
            .from("user_wallets")
            .upsert({ user_id: authUser.id, currency: "ZAR" }, { onConflict: "user_id", ignoreDuplicates: true });
        }

        let userRole = resolvedUserData!.role as UserRole;
        const admin = getSupabaseAdmin();

        // Owner registered in providers but users.role still "customer" (common before /api/me/role
        // runs its upgrade, or when mobile loads /api/provider/profile in parallel with /api/me/role).
        // Must match server-side checks in /api/me/role — otherwise Bearer + profile GET returns 403.
        if (
          userRole === "customer" &&
          (roles.includes("provider_owner" as UserRole) ||
            roles.includes("provider_staff" as UserRole))
        ) {
          const { data: ownsProvider } = await admin
            .from("providers")
            .select("id")
            .eq("user_id", resolvedUserData!.id)
            .limit(1)
            .maybeSingle();
          if (ownsProvider) {
            userRole = "provider_owner" as UserRole;
            await admin
              .from("users")
              .update({ role: "provider_owner" })
              .eq("id", resolvedUserData!.id);
          }
        }

        // Customer with active provider_staff row gets provider_staff access for provider APIs
        if (userRole === "customer" && roles.includes("provider_staff")) {
          const { data: staffRow } = await supabase
            .from("provider_staff")
            .select("id")
            .eq("user_id", resolvedUserData!.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          if (staffRow) userRole = "provider_staff";
        }

        // DB may store provider_onboarding (legacy / explicit). Allow only when the route is not
        // admin/superadmin-scoped: require at least one of customer / provider_owner / provider_staff
        // in the allowed list (never treat as superadmin-only).
        const routeAcceptsProviderOnboarding =
          userRole === ("provider_onboarding" as UserRole) &&
          roles.some((r) =>
            ["customer", "provider_owner", "provider_staff"].includes(r as string)
          );
        const roleAllowed = roles.includes(userRole) || routeAcceptsProviderOnboarding;

        if (!roleAllowed)
          throw new Error(`Insufficient permissions: requires one of ${roles.join(", ")}`);
        return { user: { id: resolvedUserData!.id, role: userRole, email: authUser.email, user_metadata: authUser.user_metadata, full_name: resolvedUserData!.full_name } };
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

    // Customer with active provider_staff row gets provider_staff access for provider APIs
    let effectiveUser = result.user;
    if (effectiveUser.role === "customer" && roles.includes("provider_staff")) {
      const { data: staffRow } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("user_id", effectiveUser.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (staffRow) {
        effectiveUser = { ...effectiveUser, role: "provider_staff" as UserRole };
      }
    }
    
    // Return user object (session not needed, using getUser() for security)
    return { user: effectiveUser };
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
 * Effective section -> roles (DB overrides merged with code defaults). Used for permission checks.
 */
export async function getEffectiveAdminSectionRoles(): Promise<Record<AdminSection, UserRole[]>> {
  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const settings = (row as { settings?: { admin_section_roles?: Partial<Record<AdminSection, UserRole[]>> } } | null)?.settings ?? {};
  const stored = settings.admin_section_roles ?? {};

  const result = {} as Record<AdminSection, UserRole[]>;
  for (const s of ALL_SECTIONS) {
    result[s] = Array.isArray(stored[s]) ? stored[s] as UserRole[] : ADMIN_SECTION_ROLES[s];
  }
  return result;
}

/**
 * Require admin access for a specific section. Use in /api/admin/* routes.
 * Superadmin can access all sections; other admin roles only their section(s).
 * Uses effective section roles from DB (platform_settings.settings.admin_section_roles) when set.
 */
export async function requireAdminSection(
  section: AdminSection,
  request?: NextRequest | Request
): Promise<{ user: { id: string; role: UserRole; email?: string; user_metadata?: any; full_name?: string | null } }> {
  const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
  if (!user) throw new Error('Authentication required');
  const effectiveRoles = await getEffectiveAdminSectionRoles();
  if (!canAccessSection(user.role as UserRole, section, effectiveRoles)) {
    throw new Error(`Insufficient permissions: access to section '${section}' required`);
  }

  if (request && (user.role as string) !== 'superadmin') {
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { data: memberships } = await supabase
      .from('user_tenant_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (!memberships || memberships.length === 0) {
      throw new Error(
        'Admin user has no active tenant assignment (user_tenant_roles). Superadmins are exempt.'
      );
    }
    const allowed = memberships.some((m: { tenant_id: string }) => m.tenant_id === tenantId);
    if (!allowed) {
      throw new Error('Admin is not assigned to this tenant for the current host');
    }
  }

  return { user };
}

/**
 * Superadmin-only admin APIs (Gods Eye, …). Matches Next.js RoleGuard `superadmin` and admin nav `superadminOnly`.
 */
export async function requireSuperadmin(
  request?: NextRequest | Request
): Promise<{ user: { id: string; role: UserRole; email?: string; user_metadata?: any; full_name?: string | null } }> {
  const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
  if (!user) throw new Error("Authentication required");
  if ((user.role as string) !== "superadmin") {
    throw new Error("Insufficient permissions: superadmin access required");
  }
  return { user };
}

/**
 * Require admin access if the user can access any of the given sections (OR).
 * Superadmin can access all sections. Uses effective section roles from DB when set.
 */
export async function requireAdminSectionAny(
  sections: AdminSection[],
  request?: NextRequest | Request
): Promise<{ user: { id: string; role: UserRole; email?: string; user_metadata?: any; full_name?: string | null } }> {
  const { user } = await requireRoleInApi(ALL_ADMIN_ROLES, request);
  if (!user) throw new Error("Authentication required");
  const effectiveRoles = await getEffectiveAdminSectionRoles();
  const role = user.role as UserRole;
  if (role !== "superadmin") {
    const ok = sections.some((section) => canAccessSection(role, section, effectiveRoles));
    if (!ok) {
      throw new Error(
        `Insufficient permissions: access to one of sections '${sections.join("', '")}' required`
      );
    }
  }

  if (request && (user.role as string) !== "superadmin") {
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();
    const { data: memberships } = await supabase
      .from("user_tenant_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("is_active", true);
    if (!memberships || memberships.length === 0) {
      throw new Error(
        "Admin user has no active tenant assignment (user_tenant_roles). Superadmins are exempt."
      );
    }
    const allowed = memberships.some((m: { tenant_id: string }) => m.tenant_id === tenantId);
    if (!allowed) {
      throw new Error("Admin is not assigned to this tenant for the current host");
    }
  }

  return { user };
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
  
  // Staff may have multiple active rows (e.g. several providers); maybeSingle() errors in that case.
  const { data: staffRows, error: staffError } = await supabase
    .from('provider_staff')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  
  if (staffError) {
    console.error('Error fetching provider ID from staff:', staffError);
    return null;
  }
  
  const staffPid = staffRows?.[0]?.provider_id;
  if (staffPid) {
    return staffPid;
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

/** E.164 normalization for API routes (shared with web client via @beautonomi/phone). */
export { normalizePhoneToE164 } from "@beautonomi/phone";
