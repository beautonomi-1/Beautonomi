import type { SupabaseClient } from "@supabase/supabase-js";

export async function logTerminalMerchantApplicationEvent(
  supabase: SupabaseClient,
  input: {
    applicationId: string;
    eventType: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    message?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("terminal_merchant_application_events").insert({
    application_id: input.applicationId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    message: input.message ?? null,
    payload: input.payload ?? {},
  });
}

export function encryptAccountNumber(accountNumber: string): {
  encrypted: string;
  last4: string;
} {
  const trimmed = accountNumber.replace(/\s/g, "");
  const last4 = trimmed.slice(-4);
  // Simple obfuscation for storage — production should use pgcrypto/vault; service role only reads.
  const encrypted = Buffer.from(trimmed, "utf8").toString("base64");
  return { encrypted, last4 };
}

export function decryptAccountNumberForExport(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try {
    return Buffer.from(encrypted, "base64").toString("utf8");
  } catch {
    return null;
  }
}
