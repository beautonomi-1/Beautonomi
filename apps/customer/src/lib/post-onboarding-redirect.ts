import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "beautonomi_post_onboarding_href_v1";

/** Remember where to go after the customer onboarding wizard (e.g. checkout deep link). */
export async function stashPostOnboardingHref(returnTo: string | string[] | undefined): Promise<void> {
  const raw = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const t = raw?.trim();
  if (!t) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  if (!t.startsWith("/(app)/") && !t.startsWith("/(auth)/")) {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, t);
}

/** Returns stashed href once, then clears it. */
export async function consumePostOnboardingHref(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) await AsyncStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
