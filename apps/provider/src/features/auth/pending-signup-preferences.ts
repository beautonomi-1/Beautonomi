import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { changeLanguage } from "@/lib/i18n";

export const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
export const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";
export const PROVIDER_MOBILE_SIGNUP_SOURCE = "provider_mobile";

export async function persistProviderSignupSource(): Promise<void> {
  await AsyncStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, PROVIDER_MOBILE_SIGNUP_SOURCE).catch(
    () => {},
  );
}

export async function applyPendingSignupPreferences(): Promise<void> {
  const [pendingSource, pendingLang] = await Promise.all([
    AsyncStorage.getItem(PENDING_SIGNUP_SOURCE_KEY),
    AsyncStorage.getItem(PENDING_PREFERRED_LANGUAGE_KEY),
  ]);
  if (!pendingSource && !pendingLang) return;
  const payload: { signup_source?: string; preferred_language?: string } = {};
  if (pendingSource) payload.signup_source = pendingSource;
  if (pendingLang) payload.preferred_language = pendingLang;
  try {
    await api.patch("/api/me/profile", payload);
    if (pendingLang) await changeLanguage(pendingLang);
  } catch {
    // Non-blocking — login/signup still succeeds; ops can reconcile later.
  }
  await Promise.all([
    pendingSource ? AsyncStorage.removeItem(PENDING_SIGNUP_SOURCE_KEY) : Promise.resolve(),
    pendingLang ? AsyncStorage.removeItem(PENDING_PREFERRED_LANGUAGE_KEY) : Promise.resolve(),
  ]);
}
