import { normalizeFullPhoneToE164, normalizePhoneToE164 } from "@/lib/phone";
import {
  normalizeSupabaseAuthPhone,
} from "@/lib/supabase-sms-otp";

export function digitsOnlyPhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Coerce profile / draft values to compact E.164 for the onboarding form. */
export function coerceOwnerPhoneToE164ForForm(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const trimmed = raw.trim();
  const compact = normalizeSupabaseAuthPhone(trimmed);

  let e164 = normalizeFullPhoneToE164(trimmed) ?? normalizeFullPhoneToE164(compact);
  if (e164) return normalizeSupabaseAuthPhone(e164);

  const digits = digitsOnlyPhone(trimmed);
  if (!digits) return "";

  if (digits.startsWith("27") && digits.length >= 11) {
    return normalizeSupabaseAuthPhone("+" + digits);
  }

  const withZa = normalizePhoneToE164(trimmed, "27") ?? normalizePhoneToE164(digits, "27");
  if (withZa) return normalizeSupabaseAuthPhone(withZa);

  if (digits.length === 9 && /^[6789]\d{8}$/.test(digits)) {
    return "+27" + digits;
  }

  return "";
}

export function isValidOwnerPhoneE164(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  const c = coerceOwnerPhoneToE164ForForm(raw);
  return !!c && /^\+[1-9]\d{7,14}$/.test(c);
}

export function phoneNumbersMatchProfile(profilePhone: string, formPhone: string): boolean {
  const pe = coerceOwnerPhoneToE164ForForm(profilePhone);
  const fe = coerceOwnerPhoneToE164ForForm(formPhone);
  if (pe && fe) return digitsOnlyPhone(pe) === digitsOnlyPhone(fe);
  const p = digitsOnlyPhone(profilePhone);
  const f = digitsOnlyPhone(formPhone);
  if (!p || !f) return false;
  if (p === f) return true;
  if (p.length >= 9 && f.length >= 9) {
    return p.endsWith(f.slice(-9)) || f.endsWith(p.slice(-9));
  }
  return p.endsWith(f) || f.endsWith(p);
}
