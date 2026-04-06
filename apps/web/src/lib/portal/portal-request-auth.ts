/**
 * Portal token validation for passwordless booking access.
 * Intended for use from Next.js `src/proxy.ts` or route handlers — not `middleware.ts`.
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
 * Validate portal token from the request (query `token` or `portal_token` cookie).
 */
export async function validatePortalRequest(request: NextRequest): Promise<PortalAuthResult> {
  const token =
    request.nextUrl.searchParams.get('token') || request.cookies.get('portal_token')?.value;

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
 * If the token is invalid, redirect to `/portal/error`; otherwise return a `NextResponse.next()`
 * with `x-portal-booking-id` and optional session cookie.
 */
export async function portalAuthGuard(request: NextRequest): Promise<NextResponse | null> {
  const result = await validatePortalRequest(request);

  if (!result.isValid) {
    return NextResponse.redirect(
      new URL(`/portal/error?reason=${encodeURIComponent(result.reason || 'Invalid token')}`, request.url),
    );
  }

  const response = NextResponse.next();
  response.headers.set('x-portal-booking-id', result.bookingId || '');

  const qpToken = request.nextUrl.searchParams.get('token');
  if (qpToken) {
    response.cookies.set('portal_token', qpToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return response;
}
