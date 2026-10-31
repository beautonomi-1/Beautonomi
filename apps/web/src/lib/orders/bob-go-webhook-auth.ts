import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredentialsPayload,
  encryptCredentialsPayload,
} from "@/lib/orders/shipping-credentials-crypto";
import { loadProviderCourierCredentialsRow } from "@/lib/orders/provider-shipping-credentials";

export async function decryptBobGoWebhookSecret(
  admin: SupabaseClient,
  providerId: string,
): Promise<string | null> {
  const row = await loadProviderCourierCredentialsRow(admin, providerId);
  const cipher = (row as { bob_go_webhook_secret_ciphertext?: string | null } | null)
    ?.bob_go_webhook_secret_ciphertext;
  if (!cipher) return null;
  try {
    const payload = decryptCredentialsPayload<{ secret: string }>(cipher);
    return payload.secret?.trim() || null;
  } catch {
    return null;
  }
}

export function mergeBobGoWebhookSecretCiphertext(
  existing: { bob_go_webhook_secret_ciphertext?: string | null } | null,
  input: { webhookSecret?: string; clear?: boolean },
): string | null {
  if (input.clear) return null;
  if (input.webhookSecret?.trim()) {
    return encryptCredentialsPayload({ secret: input.webhookSecret.trim() });
  }
  return existing?.bob_go_webhook_secret_ciphertext ?? null;
}

export async function findProviderIdByBobGoTrackingReference(
  admin: SupabaseClient,
  trackingReference: string,
): Promise<string | null> {
  const { data } = await (admin.from("product_orders") as any)
    .select("provider_id")
    .eq("tracking_number", trackingReference.trim())
    .maybeSingle();
  return (data as { provider_id?: string } | null)?.provider_id ?? null;
}
