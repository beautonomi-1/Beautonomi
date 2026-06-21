import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SESSION_MS = 24 * 60 * 60 * 1000;

export async function isWithinWhatsAppSession(phone: string): Promise<boolean> {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return false;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("whatsapp_inbound_sessions")
    .select("last_inbound_at")
    .eq("phone", normalized)
    .maybeSingle();

  if (!data?.last_inbound_at) return false;
  const last = new Date(data.last_inbound_at).getTime();
  return Date.now() - last < SESSION_MS;
}

export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function upsertWhatsAppInboundSession(input: {
  phone: string;
  userId?: string | null;
}): Promise<void> {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return;

  const supabase = getSupabaseAdmin();
  await supabase.from("whatsapp_inbound_sessions").upsert(
    {
      phone,
      user_id: input.userId ?? null,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "phone" },
  );
}

export async function revokeWhatsAppOptIn(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("users")
    .update({
      whatsapp_notifications_enabled: false,
      whatsapp_opt_in_at: null,
      whatsapp_opt_in_source: null,
    })
    .eq("id", userId);
}

export async function userHasWhatsAppOptIn(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("whatsapp_opt_in_at, whatsapp_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();

  return !!(data?.whatsapp_opt_in_at || data?.whatsapp_notifications_enabled);
}
