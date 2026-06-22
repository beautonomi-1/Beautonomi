const STORAGE_KEY = "beautonomi_signup_phone_handoff";
const TTL_MS = 5 * 60 * 1000;

export type SignupPhoneHandoff = {
  method: "phone_otp";
  phoneE164: string;
  verifiedAt: number;
};

export function writeSignupPhoneHandoff(phoneE164: string): void {
  if (typeof window === "undefined") return;
  const payload: SignupPhoneHandoff = {
    method: "phone_otp",
    phoneE164,
    verifiedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readSignupPhoneHandoff(): SignupPhoneHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupPhoneHandoff;
    if (parsed.method !== "phone_otp" || !parsed.phoneE164?.trim()) return null;
    if (Date.now() - parsed.verifiedAt > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSignupPhoneHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function applySignupPhoneHandoffToForm<
  T extends { owner_phone?: string; phone?: string; phone_verified?: boolean },
>(form: Partial<T>): void {
  const handoff = readSignupPhoneHandoff();
  if (!handoff) return;
  form.owner_phone = handoff.phoneE164;
  form.phone = handoff.phoneE164;
  form.phone_verified = true;
  clearSignupPhoneHandoff();
}

/** Customer onboarding uses separate state fields (`phoneE164`, `phoneVerified`). */
export function readAndClearCustomerPhoneHandoff(): {
  phoneE164: string;
  verified: true;
} | null {
  const handoff = readSignupPhoneHandoff();
  if (!handoff) return null;
  clearSignupPhoneHandoff();
  return { phoneE164: handoff.phoneE164, verified: true };
}
