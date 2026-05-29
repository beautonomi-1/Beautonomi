/**
 * Auth Callback Handler
 * - OAuth: exchange code for session, redirect to booking
 * - Password recovery / magic link: verify token_hash, redirect to reset-password or home
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getPortalForUser, getDefaultRouteForPortal } from "@/lib/auth/role";
import { getUserRoleServer } from "@/lib/auth/role-server";
import { resolvePortalAwareReturnPathname } from "@/lib/auth/post-login-return-path";
import { bootstrapPreferredHomeTenantForAuthedUser } from "@/lib/tenant/assign-preferred-home-tenant-from-host";
import { syncUserAuthMetadataToPublicProfile } from "@/lib/auth/sync-user-auth-metadata";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ALLOWED_NEXT_PREFIXES = [
  "/",
  "/login",
  "/signup",
  "/onboarding",
  "/portal",
  "/provider",
  "/provider/dashboard",
  "/provider/get-started",
  "/provider/onboarding",
  "/booking",
  "/book",
  "/checkout",
  "/account-settings",
  "/admin",
  "/admin/dashboard",
  "/bookings",
];

function safeReturnPath(value: string | null, origin: string): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  const url = new URL(value, origin);
  const pathname = url.pathname;
  const allowed = ALLOWED_NEXT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return allowed ? `${pathname}${url.search}` : null;
}

function authErrorRedirect(requestUrl: URL, message: string): NextResponse {
  const next = safeReturnPath(requestUrl.searchParams.get("next"), requestUrl.origin);
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", message);
  if (next) loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

async function tryBootstrapPreferredHomeTenant(userId: string, request: Request): Promise<void> {
  try {
    await bootstrapPreferredHomeTenantForAuthedUser(userId, request);
  } catch (err) {
    console.warn("[auth/callback] preferred home tenant bootstrap failed:", err);
  }
}

async function trySyncAuthMetadata(userId: string, authUser: {
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
}): Promise<void> {
  try {
    await syncUserAuthMetadataToPublicProfile(getSupabaseAdmin(), userId, authUser);
  } catch (err) {
    console.warn("[auth/callback] auth metadata sync failed:", err);
  }
}

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
    return authErrorRedirect(requestUrl, errorDescription || error);
  }

  const supabase = await getSupabaseServer();

  // Password recovery or magic link (e.g. from provider app forgot-password)
  if (tokenHash && (type === "recovery" || type === "signup" || type === "email")) {
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "recovery" | "signup" | "email",
    });
    if (verifyError) {
      console.error("Auth verifyOtp error:", verifyError);
      return authErrorRedirect(requestUrl, verifyError.message);
    }
    if (verifyData?.user?.id) {
      await tryBootstrapPreferredHomeTenant(verifyData.user.id, request);
      await trySyncAuthMetadata(verifyData.user.id, verifyData.user);
    }
    if (type === "recovery") {
      return NextResponse.redirect(
        new URL("/account-settings/login-and-security/reset-password", requestUrl.origin)
      );
    }
    const next = safeReturnPath(requestUrl.searchParams.get("next"), requestUrl.origin) || "/";
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (!code) {
    return authErrorRedirect(requestUrl, "missing_code");
  }

  // Exchange code for session
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    console.error("Error exchanging code for session:", exchangeError);
    return authErrorRedirect(requestUrl, exchangeError?.message || "authentication_failed");
  }

  if (data.user?.id) {
    await tryBootstrapPreferredHomeTenant(data.user.id, request);
    await trySyncAuthMetadata(data.user.id, data.user);
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
      const name =
        userMetadata.full_name ||
        userMetadata.name ||
        (userMetadata.first_name && userMetadata.last_name
          ? `${userMetadata.first_name} ${userMetadata.last_name}`
          : null) ||
        userMetadata.display_name ||
        userMetadata.preferred_username;

      if (name) {
        updateData.full_name = name;
      }

      // Extract avatar from OAuth metadata (Facebook may send picture as { data: { url } })
      let avatar: string | undefined;
      const rawPicture = userMetadata.picture;
      if (userMetadata.avatar_url) {
        avatar = userMetadata.avatar_url as string;
      } else if (typeof rawPicture === "string") {
        avatar = rawPicture;
      } else if (
        rawPicture &&
        typeof rawPicture === "object" &&
        (rawPicture as { data?: { url?: string } }).data?.url
      ) {
        avatar = (rawPicture as { data: { url: string } }).data.url;
      } else if (userMetadata.photo || userMetadata.image) {
        avatar = (userMetadata.photo || userMetadata.image) as string;
      }
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
          .from("users")
          .update(updateData)
          .eq("id", data.user.id);

        if (updateError) {
          console.error("Error updating user profile with OAuth data:", updateError);
          // Don't fail the auth flow if profile update fails
        } else {
          console.log("Successfully updated user profile with OAuth data:", updateData);
        }
      }
    } catch (profileError) {
      console.error("Error processing OAuth profile data:", profileError);
      // Don't fail the auth flow if profile update fails
    }
  }

  // Redirect: use "next" param if present (e.g. /provider/dashboard when logging in from provider page)
  const nextPath = safeReturnPath(requestUrl.searchParams.get("next"), requestUrl.origin);
  const normalizedPath = nextPath ? new URL(nextPath, requestUrl.origin).pathname : null;
  const isAllowedNext = nextPath !== null && normalizedPath !== null;

  // Admin paths: send to dedicated admin login (user is already signed in, so /admin/login will redirect to next)
  if (isAllowedNext && normalizedPath && normalizedPath.startsWith("/admin")) {
    return NextResponse.redirect(
      new URL(`/admin/login?next=${encodeURIComponent(nextPath!)}`, requestUrl.origin)
    );
  }
  if (isAllowedNext && normalizedPath && normalizedPath !== "/") {
    const roleResult = await getUserRoleServer(supabase);
    const portal = roleResult
      ? getPortalForUser({
          role: roleResult.role,
          provider_status: roleResult.provider_status,
        })
      : "customer";
    const pathname = resolvePortalAwareReturnPathname(portal, normalizedPath);
    const target = pathname === normalizedPath ? nextPath! : pathname;
    return NextResponse.redirect(new URL(target, requestUrl.origin));
  }

  // When next is "/" or missing, redirect by role so provider/customer land in the right place.
  // Superadmin is sent to /admin/login (dedicated admin entry), not directly to /admin/dashboard.
  if (!normalizedPath || normalizedPath === "/") {
    const roleResult = await getUserRoleServer(supabase);
    if (roleResult) {
      const portal = getPortalForUser({
        role: roleResult.role,
        provider_status: roleResult.provider_status,
      });
      let target = getDefaultRouteForPortal(portal);
      if (portal === "admin") {
        target = `/admin/login?next=${encodeURIComponent("/admin/dashboard")}`;
      }
      return NextResponse.redirect(new URL(target, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/portal", requestUrl.origin));
}
