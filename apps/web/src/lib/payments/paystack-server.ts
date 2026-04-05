import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { getPrimaryOnlinePaymentGatewayForRegion } from "@/lib/regions/payment-gateways";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

export type PaystackInitParams = {
  email: string;
  amountInSmallestUnit: number;
  currency?: string;
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, any>;
  split_code?: string;
  subaccount?: string;
  tenantId?: string | null;
};

/** Initialize a subscription payment: customer pays once and is subscribed to the plan (Paystack creates subscription). */
export type PaystackInitSubscriptionParams = {
  email: string;
  plan: string; // Paystack plan_code (e.g. PLN_xxx)
  callback_url: string;
  reference?: string;
  metadata?: Record<string, any>;
  currency?: string;
  tenantId?: string | null;
};

function normalizeTenantId(tenantId?: string | null): string | null {
  if (typeof tenantId !== "string") return null;
  const trimmed = tenantId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * When `region_payment_gateways` has a primary online row for this tenant's region,
 * ensure it is Paystack before calling Paystack APIs (migration 379 seeds ZA → paystack).
 * If no row exists, allow (legacy / not migrated yet).
 */
export async function ensurePaystackPrimaryGatewayForTenant(
  tenantId?: string | null,
): Promise<void> {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return;

  const rc = await getTenantRegionConfig(tid);
  if (!rc?.regionId) return;

  const primary = await getPrimaryOnlinePaymentGatewayForRegion(rc.regionId);
  if (!primary) return;

  const name = primary.gateway.trim().toLowerCase();
  if (name !== "paystack") {
    throw new Error(
      `Primary online payment gateway for this region is "${primary.gateway}", not Paystack. Use the correct payment flow.`,
    );
  }
}

export async function getPaystackSecretKey(options?: {
  tenantId?: string | null;
}): Promise<string> {
  const tenantId = normalizeTenantId(options?.tenantId);
  await ensurePaystackPrimaryGatewayForTenant(tenantId);

  try {
    const supabase = getSupabaseAdmin();

    // Prefer region-scoped secret (public.regions + region_secrets) when tenant maps to a region row.
    if (tenantId) {
      const regionConfig = await getTenantRegionConfig(tenantId);
      if (regionConfig?.regionId) {
        // NOTE: region_secrets.value_encrypted — see docs/REGION_SECRETS_KMS_RUNBOOK.md (plaintext vs KMS path).
        const { data } = await supabase
          .from("region_secrets")
          .select("value_encrypted")
          .eq("region_id", regionConfig.regionId)
          .eq("key", "paystack_secret_key")
          .maybeSingle();
        const regionKey = (data as { value_encrypted?: string } | null)?.value_encrypted;
        if (regionKey && typeof regionKey === "string" && regionKey.trim().length > 0) {
          return regionKey.trim();
        }
      }

      // Fallback: tenant-specific secret in tenant_secrets (newer control plane).
      const { data: tenantSecrets } = await (supabase.from("tenant_secrets") as any)
        .select("paystack_secret_key")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const tenantKey = (tenantSecrets as { paystack_secret_key?: string } | null)?.paystack_secret_key;
      if (tenantKey && typeof tenantKey === "string" && tenantKey.trim().length > 0) {
        return tenantKey.trim();
      }

      // Tenant-scoped row in platform_secrets (admin PATCH when scope is a specific tenant, not global).
      const { data: tenantPlatformSecrets } = await (supabase.from("platform_secrets") as any)
        .select("paystack_secret_key")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tenantPlatformKey = (tenantPlatformSecrets as { paystack_secret_key?: string } | null)
        ?.paystack_secret_key;
      if (
        tenantPlatformKey &&
        typeof tenantPlatformKey === "string" &&
        tenantPlatformKey.trim().length > 0
      ) {
        return tenantPlatformKey.trim();
      }
    }

    // Global platform secret as last DB fallback.
    const { data: globalSecrets } = await (supabase.from("platform_secrets") as any)
      .select("paystack_secret_key")
      .is("tenant_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const globalKey = (globalSecrets as { paystack_secret_key?: string } | null)?.paystack_secret_key;
    if (globalKey && typeof globalKey === "string" && globalKey.trim().length > 0) {
      return globalKey.trim();
    }
  } catch {
    // ignore and fall back to env
  }

  const envKey = process.env.PAYSTACK_SECRET_KEY;
  if (!envKey) {
    throw new Error(
      "Paystack secret key not configured: set PAYSTACK_SECRET_KEY in the web app env, or store paystack_secret_key in region_secrets / tenant_secrets / platform_secrets (see migration 403 for ZA test keys).",
    );
  }
  return envKey;
}

export async function initializePaystackTransaction(params: PaystackInitParams) {
  const secretKey = await getPaystackSecretKey({ tenantId: params.tenantId });

  let resolvedCurrency = params.currency?.trim();
  if (!resolvedCurrency && params.tenantId) {
    const tr = await getTenantRegionConfig(params.tenantId);
    resolvedCurrency = tr?.defaultCurrency;
  }
  resolvedCurrency = resolvedCurrency || LAST_RESORT_CURRENCY;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountInSmallestUnit,
      currency: resolvedCurrency,
      reference: params.reference,
      callback_url: params.callback_url,
      metadata: params.metadata,
      ...(params.split_code ? { split_code: params.split_code } : {}),
      ...(params.subaccount ? { subaccount: params.subaccount } : {}),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || "Paystack initialize failed");
  }

  return data as {
    status: boolean;
    message: string;
    data: { authorization_url: string; access_code: string; reference: string };
  };
}

/**
 * Initialize a transaction with a subscription plan code.
 * When the customer pays, Paystack creates the subscription and sends subscription.create.
 * Amount is taken from the plan; optional amount can be sent for display.
 */
export async function initializePaystackTransactionWithPlan(
  params: PaystackInitSubscriptionParams
) {
  const secretKey = await getPaystackSecretKey({ tenantId: params.tenantId });

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      plan: params.plan,
      callback_url: params.callback_url,
      reference: params.reference,
      metadata: params.metadata,
      ...(params.currency ? { currency: params.currency } : {}),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || "Paystack initialize subscription failed");
  }

  return data as {
    status: boolean;
    message: string;
    data: { authorization_url: string; access_code: string; reference: string };
  };
}

