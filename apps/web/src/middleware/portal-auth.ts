/**
 * Portal Authentication Middleware
 * Validates portal tokens for passwordless access
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { validatePortalToken } from '@/lib/portal/token';

export interface PortalAuthResult {
  bookingId: string | null;
  isValid: boolean;
  reason?: string;
}

/**
 * Validate portal token from request
 * Token can be in query param (?token=...) or cookie
 */
export async function validatePortalRequest(
  request: NextRequest
): Promise<PortalAuthResult> {
  // Get token from query params or cookie
  const token = 
    request.nextUrl.searchParams.get('token') ||
    request.cookies.get('portal_token')?.value;

  if (!token) {
    return {
      bookingId: null,
      isValid: false,
      reason: 'No token provided',
    };
  }

  const supabase = await getSupabaseServer();
  const result = await validatePortalToken(supabase, token);

  return result;
}

/**
 * Middleware to protect portal routes
 * Returns NextResponse with bookingId in headers if valid
 */
export async function portalAuthMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const result = await validatePortalRequest(request);

  if (!result.isValid) {
    // Redirect to error page or return 401
    return NextResponse.redirect(
      new URL(`/portal/error?reason=${encodeURIComponent(result.reason || 'Invalid token')}`, request.url)
    );
  }

  // Token is valid - add bookingId to headers for downstream use
  const response = NextResponse.next();
  response.headers.set('x-portal-booking-id', result.bookingId || '');

  // Optionally set cookie for session persistence
  if (request.nextUrl.searchParams.get('token')) {
    response.cookies.set('portal_token', request.nextUrl.searchParams.get('token')!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return response;
}
