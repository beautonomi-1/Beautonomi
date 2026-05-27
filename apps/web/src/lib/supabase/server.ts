/**
 * Supabase Server Client
 * 
 * Use this for server-side operations (API routes, server components).
 * Creates a new client instance per request to avoid caching issues.
 * 
 * ⚠️ SERVER-ONLY: This file uses 'next/headers' and must NEVER be imported in client components.
 * This file should only be imported in:
 * - API routes (/app/api/**)
 * - Server Components
 * - Server Actions
 * - Proxy (`src/proxy.ts`) — Next 16 replacement for the deprecated `middleware.ts`
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

/** Create Supabase client from Bearer token (for mobile/Expo API calls) */
export async function createSupabaseClientFromToken(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.includes('placeholder') || url === 'http://localhost:54321') {
    throw new Error(
      'FATAL: NEXT_PUBLIC_SUPABASE_URL is not configured. ' +
      'Set it in your .env.local file. Get your URL from: https://supabase.com/dashboard/project/_/settings/api'
    );
  }

  if (!key || key.includes('placeholder')) {
    throw new Error(
      'FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. ' +
      'Set it in your .env.local file. Get your key from: https://supabase.com/dashboard/project/_/settings/api'
    );
  }

  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Initialise the in-memory session so supabase.auth.updateUser() works correctly.
  // updateUser() calls getSession() internally and returns AuthSessionMissingError before
  // even reaching GoTrue when no session is present — causing valid OTP nonces to appear
  // invalid on mobile (Bearer-token) requests. The access_token is fresh (just used to
  // authenticate), so setSession will store it locally without making a network call.
  // refresh_token is required by the type but will never be used (autoRefreshToken: false).
  try {
    await client.auth.setSession({ access_token: accessToken, refresh_token: accessToken });
  } catch {
    // Non-fatal: DB/storage calls still work via global Authorization header.
  }

  return client;
}

export async function getSupabaseServer(req?: { headers: { get: (n: string) => string | null } }) {
  if (req) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) return createSupabaseClientFromToken(token);
  }
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.includes('placeholder') || supabaseUrl === 'http://localhost:54321') {
    throw new Error(
      'FATAL: NEXT_PUBLIC_SUPABASE_URL is not configured. ' +
      'Set it in your .env.local file. Get your URL from: https://supabase.com/dashboard/project/_/settings/api'
    );
  }

  if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
    throw new Error(
      'FATAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. ' +
      'Set it in your .env.local file. Get your key from: https://supabase.com/dashboard/project/_/settings/api'
    );
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have proxy refreshing cookies
          // user sessions.
        }
      },
    },
  });
}
