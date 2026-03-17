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

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.fullName,
        phone: data.phone,
        role: data.role || 'customer',
      },
    },
  });

  if (authError) {
    // Provide more detailed error information for debugging
    const errorMessage = authError.message || 'Unknown error occurred during signup';
    console.error('Signup error details:', {
      message: authError.message,
      status: authError.status,
      name: authError.name,
      email: data.email,
    });
    throw new Error(errorMessage);
  }

  // Log successful signup details for debugging
  console.log('Signup successful:', {
    userId: authData.user?.id,
    email: authData.user?.email,
    hasSession: !!authData.session,
    emailConfirmed: !!authData.user?.email_confirmed_at,
    userCreated: !!authData.user,
    sessionExpiresAt: authData.session?.expires_at,
  });

  // If no session but user was created, log a warning
  if (authData.user && !authData.session) {
    console.warn('User created but no session returned. This may indicate email verification is enabled in Supabase settings.');
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

  const res = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: trimmedEmail, password }),
    credentials: 'same-origin',
  });

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
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
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
export async function resendVerificationEmail(email: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email,
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


/**
 * OAuth sign in
 */
export async function signInWithOAuth(provider: 'google' | 'facebook' | 'apple', redirectUrl?: string) {
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

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  // OAuth will redirect the browser, so we don't return data
  return data;
}
