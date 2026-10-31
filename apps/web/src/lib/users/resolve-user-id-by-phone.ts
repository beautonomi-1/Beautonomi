import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneToE164 } from "@/lib/phone";

/** Dial digits for normalizePhoneToE164 (e.g. `27` or `+27`). */
function dialDigits(phoneCountryCode: string): string {
  return phoneCountryCode.replace(/^\+/, "").trim();
}

/**
 * Resolve a platform user id from a phone string that may be national (082…) or E.164.
 * Tries normalized E.164 first, then the raw trimmed value — each with maybeSingle only.
 */
export async function resolveUserIdByPhoneCandidates(
  supabaseAdmin: SupabaseClient,
  phoneRaw: string,
  phoneCountryCode: string,
): Promise<string | null> {
  const trimmed = phoneRaw.trim();
  if (!trimmed) return null;

  const cc = dialDigits(phoneCountryCode || "+27");
  const normalized =
    normalizePhoneToE164(trimmed, cc) ?? normalizePhoneToE164(trimmed, `+${cc}`);

  const candidates = [...new Set([normalized, trimmed].filter((v): v is string => Boolean(v)))];

  for (const candidate of candidates) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("phone", candidate)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}
