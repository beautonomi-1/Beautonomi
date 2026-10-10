import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getPrimaryOnlinePaymentGatewayForRegion } from "@/lib/regions/payment-gateways";

function normalizeTenantId(tenantId?: string | null): string | null {
  if (typeof tenantId !== "string") return null;
  const trimmed = tenantId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureStripePrimaryGatewayForTenant(tenantId?: string | null): Promise<void> {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return;
  const rc = await getTenantRegionConfig(tid);
  if (!rc?.regionId) {
    throw new Error("No region configuration for tenant");
  }
  const primary = await getPrimaryOnlinePaymentGatewayForRegion(rc.regionId);
  if (!primary || primary.gateway.trim().toLowerCase() !== "stripe") {
    throw new Error(`Primary gateway is not Stripe for this region (${primary?.gateway ?? "none"})`);
  }
}

export async function getStripeSecretKey(options?: { tenantId?: string | null }): Promise<string> {
  const tenantId = normalizeTenantId(options?.tenantId);
  await ensureStripePrimaryGatewayForTenant(tenantId);
  const supabase = getSupabaseAdmin();

  if (tenantId) {
    const regionConfig = await getTenantRegionConfig(tenantId);
    if (regionConfig?.regionId) {
      const { data } = await supabase
        .from("region_secrets")
        .select("value_encrypted")
        .eq("region_id", regionConfig.regionId)
        .eq("key", "stripe_secret_key")
        .maybeSingle();
      const regionKey = (data as { value_encrypted?: string } | null)?.value_encrypted;
      if (regionKey?.trim()) return regionKey.trim();
    }

    const { data: tenantSecrets } = await (supabase.from("tenant_secrets") as any)
      .select("stripe_secret_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const tenantKey = (tenantSecrets as { stripe_secret_key?: string } | null)?.stripe_secret_key;
    if (tenantKey?.trim()) return tenantKey.trim();
  }

  const { data: platformSecrets } = await supabase
    .from("platform_secrets")
    .select("stripe_secret_key")
    .maybeSingle();
  const platformKey = (platformSecrets as { stripe_secret_key?: string } | null)?.stripe_secret_key;
  if (platformKey?.trim()) return platformKey.trim();

  const envKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (envKey) return envKey;

  throw new Error("Stripe secret key not configured");
}

export async function getStripeWebhookSecret(options?: { tenantId?: string | null }): Promise<string> {
  const tenantId = normalizeTenantId(options?.tenantId);
  const supabase = getSupabaseAdmin();

  if (tenantId) {
    const regionConfig = await getTenantRegionConfig(tenantId);
    if (regionConfig?.regionId) {
      const { data } = await supabase
        .from("region_secrets")
        .select("value_encrypted")
        .eq("region_id", regionConfig.regionId)
        .eq("key", "stripe_webhook_secret")
        .maybeSingle();
      const regionKey = (data as { value_encrypted?: string } | null)?.value_encrypted;
      if (regionKey?.trim()) return regionKey.trim();
    }

    const { data: tenantSecrets } = await (supabase.from("tenant_secrets") as any)
      .select("stripe_webhook_secret")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const tenantKey = (tenantSecrets as { stripe_webhook_secret?: string } | null)?.stripe_webhook_secret;
    if (tenantKey?.trim()) return tenantKey.trim();
  }

  const envKey = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (envKey) return envKey;

  throw new Error("Stripe webhook secret not configured");
}

export async function getStripeClient(tenantId?: string | null) {
  const Stripe = (await import("stripe")).default;
  const secret = await getStripeSecretKey({ tenantId });
  return new Stripe(secret);
}

/** Publishable key for client SDKs (region → tenant → env). Never throws. */
export async function getStripePublishableKey(options?: {
  tenantId?: string | null;
  regionId?: string | null;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  let regionId = options?.regionId?.trim() || null;
  if (!regionId && options?.tenantId) {
    const tid = normalizeTenantId(options.tenantId);
    if (tid) {
      regionId = (await getTenantRegionConfig(tid))?.regionId ?? null;
    }
  }

  if (regionId) {
    const { data } = await supabase
      .from("region_secrets")
      .select("value_encrypted")
      .eq("region_id", regionId)
      .eq("key", "stripe_publishable_key")
      .maybeSingle();
    const regionKey = (data as { value_encrypted?: string } | null)?.value_encrypted;
    if (regionKey?.trim()) return regionKey.trim();
  }

  const envKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  return envKey || null;
}
