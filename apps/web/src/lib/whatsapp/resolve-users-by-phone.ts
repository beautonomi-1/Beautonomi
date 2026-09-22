import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PHONE_COUNTRY_CODE, normalizePhoneToE164 } from "@/lib/phone";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/sessions";

function phoneVariants(from: string): string[] {
  const normalized = normalizeWhatsAppPhone(from);
  const digits = normalized.replace(/\D/g, "");
  const e164 =
    normalizePhoneToE164(normalized, DEFAULT_PHONE_COUNTRY_CODE) ?? (digits ? `+${digits}` : "");
  const raw = from.replace(/^whatsapp:/i, "").trim();
  const set = new Set<string>();
  for (const v of [normalized, e164, digits, raw, digits ? `+${digits}` : ""]) {
    if (v) set.add(v);
  }
  return [...set];
}

/**
 * Resolve all user rows that share the inbound WhatsApp number (E.164 variants).
 */
export async function resolveUsersByWhatsAppPhone(
  supabase: SupabaseClient,
  from: string,
): Promise<{ normalizedPhone: string; users: Array<{ id: string; phone: string | null }> }> {
  const normalizedPhone = normalizeWhatsAppPhone(from);
  if (!normalizedPhone) return { normalizedPhone: "", users: [] };

  const variants = phoneVariants(from);
  const orClause = variants.map((p) => `phone.eq.${p}`).join(",");
  const { data } = await supabase.from("users").select("id, phone").or(orClause).limit(10);

  const targetDigits = normalizedPhone.replace(/\D/g, "");
  const users = (data ?? []).filter((row) => {
    const p = (row.phone as string | null)?.trim();
    if (!p) return false;
    const rowNorm =
      normalizePhoneToE164(p, DEFAULT_PHONE_COUNTRY_CODE) ?? normalizeWhatsAppPhone(p);
    return rowNorm.replace(/\D/g, "") === targetDigits;
  }) as Array<{ id: string; phone: string | null }>;

  const byId = new Map<string, { id: string; phone: string | null }>();
  for (const u of users) byId.set(u.id, u);
  return { normalizedPhone, users: [...byId.values()] };
}
