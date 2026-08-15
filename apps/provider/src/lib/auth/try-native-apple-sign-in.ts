import { Platform } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Native Sign in with Apple (Guideline 4.8).
 * Returns handled:false on Android/web so callers can use the existing OAuth browser flow.
 */
export async function tryNativeAppleSignIn(
  supabase: SupabaseClient,
): Promise<{ handled: boolean; error: Error | null }> {
  if (Platform.OS !== "ios") return { handled: false, error: null };

  try {
    const AppleAuthentication = await import("expo-apple-authentication");
    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) return { handled: false, error: null };

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { handled: true, error: new Error("Apple did not return an identity token.") };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) return { handled: true, error: new Error(error.message) };

    const given = credential.fullName?.givenName?.trim();
    const family = credential.fullName?.familyName?.trim();
    const fullName = [given, family].filter(Boolean).join(" ");
    if (fullName) {
      await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => undefined);
    }
    return { handled: true, error: null };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_REQUEST_CANCELED") {
      return { handled: true, error: new Error("Sign-in was cancelled") };
    }
    return {
      handled: true,
      error: err instanceof Error ? err : new Error("Apple sign-in failed"),
    };
  }
}
