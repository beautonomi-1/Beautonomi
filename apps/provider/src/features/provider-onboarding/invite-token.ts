import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import type { OnboardingFormData } from "./types";

export const ONBOARDING_INVITE_TOKEN_STORAGE_KEY = "beautonomi_onboarding_invite_token";

export async function storeOnboardingInviteToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  await AsyncStorage.setItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY, trimmed);
}

export async function getStoredOnboardingInviteToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function clearStoredOnboardingInviteToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_INVITE_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Redeem admin invite and return lead prefill for the wizard. */
export async function redeemOnboardingInviteToken(
  token: string,
): Promise<Partial<OnboardingFormData> | null> {
  const res = await api.post<{
    lead_id?: string;
    already_matched?: boolean;
    prefill?: {
      business_name: string | null;
      contact_person_name: string | null;
      email: string | null;
      phone_e164: string | null;
      description: string | null;
      onboarding_data: Partial<OnboardingFormData>;
    };
  }>("/api/provider/onboarding/invite/redeem", { invite_token: token });
  if (res.error || !res.data?.prefill) return null;

  const prefill = res.data.prefill;
  const merged: Partial<OnboardingFormData> = { ...(prefill.onboarding_data || {}) };
  if (!merged.business_name && prefill.business_name) merged.business_name = prefill.business_name;
  if (!merged.owner_name && prefill.contact_person_name) merged.owner_name = prefill.contact_person_name;
  if (!merged.owner_email && prefill.email) merged.owner_email = prefill.email;
  if (!merged.owner_phone && prefill.phone_e164) merged.owner_phone = prefill.phone_e164;
  if (!merged.description && prefill.description) merged.description = prefill.description;
  return merged;
}
