/**
 * Auth Callback Handler
 * - OAuth: exchange code for session, redirect to booking
 * - Password recovery / magic link: verify token_hash, redirect to reset-password or home
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(`/booking?error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin)
    );
  }

  const supabase = await getSupabaseServer();

  // Password recovery or magic link (e.g. from provider app forgot-password)
  if (tokenHash && (type === "recovery" || type === "signup" || type === "email")) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "recovery" | "signup" | "email",
    });
    if (verifyError) {
      console.error("Auth verifyOtp error:", verifyError);
      return NextResponse.redirect(
        new URL(`/booking?error=${encodeURIComponent(verifyError.message)}`, requestUrl.origin)
      );
    }
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/account-settings/login-and-security/reset-password", requestUrl.origin));
    }
    const next = requestUrl.searchParams.get("next") || "/";
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/booking?error=missing_code", requestUrl.origin)
    );
  }

  // Exchange code for session
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    console.error("Error exchanging code for session:", exchangeError);
    return NextResponse.redirect(
      new URL(`/booking?error=${encodeURIComponent(exchangeError?.message || "authentication_failed")}`, requestUrl.origin)
    );
  }

  // Update user profile with OAuth metadata if available
  if (data.user) {
    try {
      const userMetadata = data.user.user_metadata || {};
      const updateData: {
        full_name?: string;
        avatar_url?: string;
        phone?: string;
      } = {};

      // Extract name from OAuth metadata (different providers use different fields)
      const name = userMetadata.full_name || 
                   userMetadata.name || 
                   (userMetadata.first_name && userMetadata.last_name 
                     ? `${userMetadata.first_name} ${userMetadata.last_name}` 
                     : null) ||
                   userMetadata.display_name ||
                   userMetadata.preferred_username;

      if (name) {
        updateData.full_name = name;
      }

      // Extract avatar from OAuth metadata
      const avatar = userMetadata.avatar_url || 
                     userMetadata.picture || 
                     userMetadata.photo ||
                     userMetadata.image;

      if (avatar) {
        updateData.avatar_url = avatar;
      }

      // Extract phone from OAuth metadata
      const phone = userMetadata.phone || userMetadata.phone_number;
      if (phone) {
        updateData.phone = phone;
      }

      // Update user profile if we have any data to update
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('users')
          .update(updateData)
          .eq('id', data.user.id);

        if (updateError) {
          console.error('Error updating user profile with OAuth data:', updateError);
          // Don't fail the auth flow if profile update fails
        } else {
          console.log('Successfully updated user profile with OAuth data:', updateData);
        }
      }
    } catch (profileError) {
      console.error('Error processing OAuth profile data:', profileError);
      // Don't fail the auth flow if profile update fails
    }
  }

  // Try to restore booking state from localStorage (handled client-side)
  // For now, redirect back to booking page
  // The booking flow will check auth state and continue
  const redirectUrl = new URL("/booking", requestUrl.origin);
  
  // Preserve any query params that were in the original booking URL
  // This will be handled by the booking flow component checking localStorage
  
  return NextResponse.redirect(redirectUrl);
}
