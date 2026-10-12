import {
  getFlutterwaveWebhookHash,
  verifyFlutterwaveWebhookHash,
} from "@/lib/payments/flutterwave-server";
import { getOnlinePaymentCheckoutByReference } from "@/lib/payments/online-payment-checkouts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function uniqueSecrets(secrets: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of secrets) {
    const t = (s ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function readMetaTenantId(payload: Record<string, unknown>): string | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const meta =
    data.meta && typeof data.meta === "object" ? (data.meta as Record<string, unknown>) : null;
  const tenantId = meta?.tenant_id;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

function readTxRef(payload: Record<string, unknown>): string | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : payload;
  const txRef = data.tx_ref ?? data.reference;
  return typeof txRef === "string" && txRef.trim() ? txRef.trim() : null;
}

async function tenantFromPayoutReference(reference: string): Promise<string | null> {
  const m = /^payout_([0-9a-f-]{36})$/i.exec(reference.trim());
  if (!m) return null;
  const supabase = getSupabaseAdmin();
  const { data: payout } = await supabase
    .from("payouts")
    .select("provider_id")
    .eq("id", m[1])
    .maybeSingle();
  const providerId = (payout as { provider_id?: string } | null)?.provider_id;
  if (!providerId) return null;
  const { data: prov } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const tenantId = (prov as { tenant_id?: string | null } | null)?.tenant_id;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

/** Collect webhook hash secrets: env fallback + tenant from meta, checkout, or payout reference. */
export async function resolveFlutterwaveWebhookVerificationSecrets(
  body: string,
): Promise<string[]> {
  const secrets: Array<string | null | undefined> = [await getFlutterwaveWebhookHash({})];

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return uniqueSecrets(secrets);
  }

  const tenantFromMeta = readMetaTenantId(payload);
  if (tenantFromMeta) {
    secrets.unshift(await getFlutterwaveWebhookHash({ tenantId: tenantFromMeta }));
  }

  const txRef = readTxRef(payload);
  if (txRef) {
    const checkout = await getOnlinePaymentCheckoutByReference(txRef);
    if (checkout?.tenant_id) {
      secrets.unshift(await getFlutterwaveWebhookHash({ tenantId: checkout.tenant_id }));
    }
    if (txRef.startsWith("payout_")) {
      const tenantId = await tenantFromPayoutReference(txRef);
      if (tenantId) secrets.unshift(await getFlutterwaveWebhookHash({ tenantId }));
    }
  }

  return uniqueSecrets(secrets);
}

export async function verifyFlutterwaveWebhookSignature(
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && !signature) {
    return true;
  }
  const secrets = await resolveFlutterwaveWebhookVerificationSecrets(body);
  if (secrets.length === 0) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signature) return false;
  return secrets.some((secret) => verifyFlutterwaveWebhookHash(signature, secret));
}
