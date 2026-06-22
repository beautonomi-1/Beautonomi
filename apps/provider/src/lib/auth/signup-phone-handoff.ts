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

export async function readSignupPhoneHandoff(): Promise<SignupPhoneHandoff | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupPhoneHandoff;
    if (parsed.method !== "phone_otp" || !parsed.phoneE164?.trim()) return null;
    if (Date.now() - parsed.verifiedAt > TTL_MS) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSignupPhoneHandoff(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function applySignupPhoneHandoffToForm<
  T extends { owner_phone?: string; phone?: string; phone_verified?: boolean },
>(form: Partial<T>): Promise<void> {
  const handoff = await readSignupPhoneHandoff();
  if (!handoff) return;
  form.owner_phone = handoff.phoneE164;
  form.phone = handoff.phoneE164;
  form.phone_verified = true;
  await clearSignupPhoneHandoff();
}
