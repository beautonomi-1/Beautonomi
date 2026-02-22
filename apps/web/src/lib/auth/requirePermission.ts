/**
 * Permission Enforcement Middleware
 *
 * Checks if user has required permission before allowing action.
 * Accepts an optional `request` parameter to support Bearer token auth from mobile apps.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireRoleInApi, unauthorizedResponse } from '@/lib/supabase/api-helpers';
import { hasPermission, isProviderOwner } from './permissions';

export type PermissionCheckResult =
  | { authorized: true; user: { id: string; role?: string }; response?: never }
  | { authorized: false; response?: NextResponse; user?: { id: string; role?: string } };

export async function requirePermission(
  permission: string,
  requestOrRoles?: NextRequest | Request | string[],
  maybeRequest?: NextRequest | Request,
): Promise<PermissionCheckResult> {
  let allowedRoles = ['provider_owner', 'superadmin'];
  let request: NextRequest | Request | undefined;

  if (Array.isArray(requestOrRoles)) {
    allowedRoles = requestOrRoles;
    request = maybeRequest;
  } else {
    request = requestOrRoles;
  }

  try {
    const { user } = await requireRoleInApi(
      ['provider_owner', 'provider_staff', 'superadmin'],
      request,
    );

    if (!user) {
      return {
        authorized: false,
        response: unauthorizedResponse('Authentication required'),
      };
    }

    if (allowedRoles.includes('superadmin') || allowedRoles.includes('provider_owner')) {
      const isOwner = await isProviderOwner(user.id);
      if (isOwner) {
        return { authorized: true, user };
      }
    }

    if (user.role === 'superadmin') {
      return { authorized: true, user };
    }

    const hasAccess = await hasPermission(user.id, permission as any);

    if (!hasAccess) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            error: 'Permission denied',
            message: `You do not have permission to ${permission.replace(/_/g, ' ')}`,
            permission,
          },
          { status: 403 },
        ),
        user,
      };
    }

    return { authorized: true, user };
  } catch {
    return {
      authorized: false,
      response: unauthorizedResponse('Authentication required'),
    };
  }
}

export async function requireAnyPermission(
  permissions: string[],
  requestOrRoles?: NextRequest | Request | string[],
  maybeRequest?: NextRequest | Request,
): Promise<PermissionCheckResult> {
  let allowedRoles = ['provider_owner', 'superadmin'];
  let request: NextRequest | Request | undefined;

  if (Array.isArray(requestOrRoles)) {
    allowedRoles = requestOrRoles;
    request = maybeRequest;
  } else {
    request = requestOrRoles;
  }

  try {
    const { user } = await requireRoleInApi(
      ['provider_owner', 'provider_staff', 'superadmin'],
      request,
    );

    if (!user) {
      return {
        authorized: false,
        response: unauthorizedResponse('Authentication required'),
      };
    }

    if (allowedRoles.includes('provider_owner')) {
      const isOwner = await isProviderOwner(user.id);
      if (isOwner) {
        return { authorized: true, user };
      }
    }

    if (user.role === 'superadmin') {
      return { authorized: true, user };
    }

    for (const permission of permissions) {
      const hasAccess = await hasPermission(user.id, permission as any);
      if (hasAccess) {
        return { authorized: true, user };
      }
    }

    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: 'Permission denied',
          message: `You do not have any of the required permissions: ${permissions.join(', ')}`,
          permissions,
        },
        { status: 403 },
      ),
      user,
    };
  } catch {
    return {
      authorized: false,
      response: unauthorizedResponse('Authentication required'),
    };
  }
}

export async function requireAllPermissions(
  permissions: string[],
  requestOrRoles?: NextRequest | Request | string[],
  maybeRequest?: NextRequest | Request,
): Promise<PermissionCheckResult> {
  let allowedRoles = ['provider_owner', 'superadmin'];
  let request: NextRequest | Request | undefined;

  if (Array.isArray(requestOrRoles)) {
    allowedRoles = requestOrRoles;
    request = maybeRequest;
  } else {
    request = requestOrRoles;
  }

  try {
    const { user } = await requireRoleInApi(
      ['provider_owner', 'provider_staff', 'superadmin'],
      request,
    );

    if (!user) {
      return {
        authorized: false,
        response: unauthorizedResponse('Authentication required'),
      };
    }

    if (allowedRoles.includes('provider_owner')) {
      const isOwner = await isProviderOwner(user.id);
      if (isOwner) {
        return { authorized: true, user };
      }
    }

    if (user.role === 'superadmin') {
      return { authorized: true, user };
    }

    for (const permission of permissions) {
      const hasAccess = await hasPermission(user.id, permission as any);
      if (!hasAccess) {
        return {
          authorized: false,
          response: NextResponse.json(
            {
              error: 'Permission denied',
              message: `You do not have permission to ${permission.replace(/_/g, ' ')}`,
              permission,
            },
            { status: 403 },
          ),
          user,
        };
      }
    }

    return { authorized: true, user };
  } catch {
    return {
      authorized: false,
      response: unauthorizedResponse('Authentication required'),
    };
  }
}
