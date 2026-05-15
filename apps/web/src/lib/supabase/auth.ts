/**
 * Supabase Authentication Helpers (Client-Side)
 * 
 * Client-side authentication functions that use getSupabaseClient.
 * For server-side functions, use auth-server.ts
 */

import { getSupabaseClient } from './client';
import type { UserRole } from '@/types/beautonomi';

export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  role?: UserRole;
  /** Supabase sends this as `redirect_to` on confirmation links — must be allowed in Supabase Auth URL config. */
  emailRedirectTo?: string;
}

/**
 * Confirmation links from signup/resend should hit `/auth/callback` so the session is established
 * and the user lands on the right screen (e.g. provider onboarding vs customer onboarding).
 */
export function buildEmailConfirmationRedirectUrl(params: {
  redirectContext?: "provider" | "customer";
  redirectUrl?: string | null;
}): string | undefined {
  if (typeof window === "undefined") return undefined;
  const origin = window.location.origin;
  let next = "/onboarding";
  const raw = params.redirectUrl?.trim();
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    try {
      const u = new URL(raw, origin);
      const pathWithQuery = `${u.pathname}${u.search}`;
      next = pathWithQuery || next;
    } catch {
      next = "/onboarding";
    }
  } else if (params.redirectContext === "provider") {
    next = "/provider/onboarding";
  }
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export interface SignInData {
  email: string;
  password: string;
}

/**
 * Sign up a new user (client-side)
 */
export async function signUp(data: SignUpData) {
  const supabase = getSupabaseClient();

  let authData;
  let authError;
  try {
    const result = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          phone: data.phone,
          role: data.role || 'customer',
        },
        ...(data.emailRedirectTo ? { emailRedirectTo: data.emailRedirectTo } : {}),
      },
    });
    authData = result.data;
    authError = result.error;
  } catch (err: any) {
    if (err.message?.includes("Lock") && err.message?.includes("stole it")) {
      console.warn("Ignored lock error during signUp", err);
      // We don't have the session data if it threw, but the user was likely created.
      // Return empty data so the fallback login can take over.
      authData = { user: null, session: null };
      authError = null;
    } else {
      throw err;
    }
  }

  if (authError) {
    const errorMessage = authError.message || 'Unknown error occurred during signup';
    console.error('Signup error:', { message: authError.message, status: authError.status });
    throw new Error(errorMessage);
  }

  if (authData.user && !authData.session) {
    console.warn('User created but no session returned — email verification may be enabled.');
  }

  // User profile is created automatically via trigger
  return authData;
}

/**
 * Sign in a user (client-side).
 * Uses the /api/auth/sign-in proxy to avoid CORS and 502 when calling Supabase from the browser.
 */
export async function signIn(data: SignInData) {
  const supabase = getSupabaseClient();
  const trimmedEmail = data.email.trim();
  const password = data.password;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, password }),
      credentials: 'same-origin',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Login timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await res.json().catch(() => ({}));
  const message = typeof json?.error === 'string' ? json.error : 'Sign-in failed. Please try again.';

  if (!res.ok) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Sign in error details:', {
        status: res.status,
        message: json?.error,
        email: trimmedEmail,
      });
    }
    throw new Error(message);
  }

  const session = json?.data?.session;
  const user = json?.data?.user;

  if (session?.access_token && session?.refresh_token && supabase) {
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch (err: any) {
      if (err.message?.includes("Lock") && err.message?.includes("stole it")) {
        // Ignore lock errors on setSession since cookies are already set by the server
        console.warn("Ignored lock error on setSession", err);
      } else {
        throw err;
      }
    }
  }

  return {
    user: user ?? null,
    session: session
      ? {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
        }
      : null,
  };
}

/**
 * Send passwordless email sign-in (`signInWithOtp`).
 * Omit `emailRedirectTo` (avoids tying the message to a redirect-only link flow).
 * Whether the user receives a **numeric code** vs a **clickable magic link** is controlled by the
 * **Magic Link** template in the Supabase dashboard (`{{ .Token }}` vs `{{ .ConfirmationURL }}`); see
 * `supabase/email-templates/README.md`.
 * New accounts are created on successful verification (`shouldCreateUser: true`).
 */
export async function sendEmailSignInOtp(email: string) {
  const supabase = getSupabaseClient();
  return supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
}

/**
 * Sign out current user (client-side)
 */
export async function signOut() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Get current session (client-side)
 */
export async function getSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

/**
 * Get current user (client-side)
 */
export async function getCurrentUser() {
  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  return user;
}


/**
 * Resend verification email for an unverified user
 * This can be called even when the user is not logged in
 */
export async function resendVerificationEmail(email: string, emailRedirectTo?: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Reset password (send reset email)
 */
export async function resetPassword(email: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Update password
 */
export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }
}


export type SocialOAuthProvider = 'google' | 'apple';

/**
 * OAuth sign in (Google or Apple). Google-specific `queryParams` are not sent to Apple.
 */
export async function signInWithOAuth(
  provider: SocialOAuthProvider,
  redirectUrl?: string,
) {
  const supabase = getSupabaseClient();
  
  // Get the current URL for redirect
  // If redirectUrl is provided, use it; otherwise use default callback
  const redirectTo = typeof window !== 'undefined' 
    ? (redirectUrl || `${window.location.origin}/auth/callback`)
    : (redirectUrl || '/auth/callback');

  // Save current booking state to localStorage if we're in booking flow
  if (typeof window !== 'undefined' && window.location.pathname.includes('/booking')) {
    try {
      const bookingState = {
        path: window.location.pathname,
        search: window.location.search,
        timestamp: Date.now(),
      };
      localStorage.setItem('booking_redirect_state', JSON.stringify(bookingState));
    } catch (e) {
      console.warn('Failed to save booking state:', e);
    }
  }

  const options: {
    redirectTo: string;
    queryParams?: Record<string, string>;
    scopes?: string;
  } = { redirectTo };
  if (provider === 'google') {
    options.queryParams = {
      access_type: 'offline',
      prompt: 'consent',
    };
  }
  if (provider === 'apple') {
    options.scopes = 'name email';
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options,
  });

  if (error) {
    throw new Error(error.message);
  }

  // OAuth will redirect the browser, so we don't return data
  return data;
}
