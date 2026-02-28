import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/** Placeholder email when auth has no email (e.g. phone-only). Must match trigger in 199_fix_handle_new_user_trigger_silent_errors.sql */
const PLACEHOLDER_EMAIL_DOMAIN = "beautonomi.local";

/**
 * Ensures the authenticated user has a row in public.users (and user_wallets if needed).
 * Used before creating a booking so payment and booking records can reference customer_id.
 * Handles race where auth trigger hasn't run yet or failed (e.g. new OAuth/OTP sign-in).
 */
export async function ensureUserProfileForAuthUser(
  adminSupabase: SupabaseClient,
  user: User
): Promise<void> {
  const { data: existing } = await adminSupabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const rawEmail = user.email?.trim() || "";
  const email =
    rawEmail.length > 0 ? rawEmail : `user-${user.id}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  const fullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    ([user.user_metadata?.given_name, user.user_metadata?.family_name].filter(Boolean).join(" ") || null);
  const phone = user.user_metadata?.phone ?? user.phone ?? null;
  const role = (user.user_metadata?.role as string) || "customer";

  const { error: insertUserError } = await adminSupabase.from("users").insert({
    id: user.id,
    email,
    full_name: fullName,
    phone,
    role: role === "customer" || role === "provider" || role === "superadmin" ? role : "customer",
  });

  if (insertUserError) {
    if (insertUserError.code === "23505") {
      // Unique violation: either trigger created the row (id conflict) or email already exists (different user)
      const { data: afterConflict } = await adminSupabase
        .from("users")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (afterConflict) {
        // Trigger or race created the row; continue to wallet
      } else {
        console.warn("ensureUserProfileForAuthUser: email already in use", {
          userId: user.id,
          email: user.email,
        });
        throw new Error(
          "An account with this email already exists. Please sign in with that account to continue."
        );
      }
    } else {
      console.warn("ensureUserProfileForAuthUser: failed to insert user", insertUserError);
      throw new Error(
        "We couldn't save your profile. Please try again or contact support if it keeps happening."
      );
    }
  }

  // Ensure wallet exists (trigger might have created it; if we inserted user manually, create wallet)
  const { data: wallet } = await adminSupabase
    .from("user_wallets")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!wallet) {
    const { error: walletError } = await adminSupabase.from("user_wallets").insert({
      user_id: user.id,
      currency: "ZAR",
    });
    if (walletError && walletError.code !== "23505") {
      console.warn("ensureUserProfileForAuthUser: failed to create wallet", walletError);
    }
  }
}
