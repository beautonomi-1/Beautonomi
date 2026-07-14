import type { SupabaseClient } from "@supabase/supabase-js";

/** Inbound keywords that mark a lead as do-not-contact (WhatsApp/SMS opt-out). */
const OPT_OUT_KEYWORD =
  /^(stop|unsubscribe|opt[\s-]?out|cancel|quit|end|remove|stopall)\.?$/i;

export function isOptOutKeyword(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  return OPT_OUT_KEYWORD.test(normalized);
}

export function leadIsDoNotContact(lead: { do_not_contact?: boolean | null } | null | undefined): boolean {
  return Boolean(lead?.do_not_contact);
}

/** Returns true when any active lead on this tenant has the phone marked DNC. */
export async function phoneIsDoNotContact(
  supabase: SupabaseClient,
  tenantId: string,
  phoneE164: string,
): Promise<boolean> {
  const normalized = phoneE164.trim();
  if (!normalized) return false;

  const { data } = await supabase
    .from("provider_leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", normalized)
    .eq("do_not_contact", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}
