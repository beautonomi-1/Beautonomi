import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "beautonomi_signup_phone_handoff";
const TTL_MS = 5 * 60 * 1000;

export type SignupPhoneHandoff = {
  method: "phone_otp";
  phoneE164: string;
  verifiedAt: number;
};

export async function writeSignupPhoneHandoff(phoneE164: string): Promise<void> {
  const payload: SignupPhoneHandoff = {
    method: "phone_otp",
    phoneE164,
    verifiedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function readAndClearCustomerPhoneHandoff(): Promise<{
  phoneE164: string;
  verified: true;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupPhoneHandoff;
    if (parsed.method !== "phone_otp" || !parsed.phoneE164?.trim()) return null;
    if (Date.now() - parsed.verifiedAt > TTL_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    return { phoneE164: parsed.phoneE164, verified: true };
  } catch {
    return null;
  }
}
