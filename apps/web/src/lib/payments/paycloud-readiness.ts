import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { checkPaycloudFeatureAccess } from "@/lib/subscriptions/feature-access";

export type PaycloudReadinessBlockerCode =
  | "FLAG_OFF"
  | "PLAN_REQUIRED"
  | "NOT_ACCEPTED"
  | "NO_TERMINALS"
  | "ALL_SUSPENDED"
  | "NO_MERCHANT";

export interface PaycloudReadinessBlocker {
  code: PaycloudReadinessBlockerCode;
  title: string;
  actionLabel: string;
  href?: string;
}

export interface PaycloudReadinessWarning {
  code: string;
  message: string;
}

export interface PaycloudReadiness {
  ready: boolean;
  blockers: PaycloudReadinessBlocker[];
  warnings: PaycloudReadinessWarning[];
  terminals: { active: number; suspended: number; inFlight: number; withoutMerchant: number };
  settings: { accept: boolean; qr: boolean; cashback: boolean };
  plan?: {
    enabled: boolean;
    maxTerminals: number | null;
    usedTerminals: number;
  };
  account_environment?: "sandbox" | "live" | "mixed" | null;
}

async function isFeatureEnabled(
  supabase: SupabaseClient,
  featureKey: string,
  tenantId: string | null,
): Promise<boolean> {
  let q = supabase.from("feature_flags").select("enabled, tenant_id").eq("feature_key", featureKey);
  q = tenantId ? q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`) : q.is("tenant_id", null);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ enabled?: boolean; tenant_id?: string | null }>;
  const tenantRow = tenantId ? rows.find((r) => r.tenant_id === tenantId) : undefined;
  const globalRow = rows.find((r) => r.tenant_id == null);
  return tenantRow != null ? tenantRow.enabled === true : globalRow?.enabled === true;
}

/**
 * Shared PayCloud collect readiness for provider UI and admin diagnostics.
 */
export async function computePaycloudReadiness(
  supabase: SupabaseClient,
  providerId: string,
): Promise<PaycloudReadiness> {
  const blockers: PaycloudReadinessBlocker[] = [];
  const warnings: PaycloudReadinessWarning[] = [];

  const { data: provider } = await supabase
    .from("providers")
    .select("accept_paycloud, tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  if (!provider) {
    return {
      ready: false,
      blockers: [
        {
          code: "NOT_ACCEPTED",
          title: "Provider not found",
          actionLabel: "Contact support",
        },
      ],
      warnings: [],
      terminals: { active: 0, suspended: 0, inFlight: 0, withoutMerchant: 0 },
      settings: { accept: false, qr: false, cashback: false },
    };
  }

  const tenantId = (provider as { tenant_id?: string | null }).tenant_id ?? null;
  const flagOn = await isFeatureEnabled(supabase, FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, tenantId);
  if (!flagOn) {
    blockers.push({
      code: "FLAG_OFF",
      title: "Card machines are not enabled for your market",
      actionLabel: "Contact support",
    });
  }

  const planAccess = await checkPaycloudFeatureAccess(providerId, supabase);
  if (!planAccess.enabled) {
    blockers.push({
      code: "PLAN_REQUIRED",
      title: "Your plan does not include card machines",
      actionLabel: "Upgrade plan",
      href: "/provider/subscription",
    });
  }

  const { data: settings } = await supabase
    .from("provider_paycloud_settings")
    .select("qr_payments_enabled, cashback_enabled, accept_paycloud")
    .eq("provider_id", providerId)
    .maybeSingle();

  const accept =
    (provider as { accept_paycloud?: boolean }).accept_paycloud ??
    (settings as { accept_paycloud?: boolean } | null)?.accept_paycloud ??
    false;
  if (!accept) {
    blockers.push({
      code: "NOT_ACCEPTED",
      title: "Turn on in-person card payments",
      actionLabel: "Open card machines settings",
      href: "/provider/settings/sales/card-machines",
    });
  }

  const { data: terminalRows } = await supabase
    .from("paycloud_terminals")
    .select("id, status, is_active, in_flight_payment_id, paycloud_merchant_id, location_id")
    .eq("provider_id", providerId)
    .not("status", "eq", "decommissioned");

  const rows = terminalRows ?? [];
  const active = rows.filter((t) => t.is_active && t.status !== "suspended").length;
  const suspended = rows.filter((t) => t.status === "suspended" || !t.is_active).length;
  const inFlight = rows.filter((t) => t.in_flight_payment_id).length;
  const activeRows = rows.filter((t) => t.is_active && t.status !== "suspended");
  const withoutMerchant = activeRows.filter((t) => !t.paycloud_merchant_id).length;
  const portableCount = rows.filter((t) => !t.location_id && t.is_active && t.status !== "suspended").length;

  if (rows.length === 0) {
    blockers.push({
      code: "NO_TERMINALS",
      title: "Add or wait for a card machine",
      actionLabel: "Card machines settings",
      href: "/provider/settings/sales/card-machines",
    });
  } else if (active === 0) {
    blockers.push({
      code: "ALL_SUSPENDED",
      title: "All card machines are inactive or suspended",
      actionLabel: "Contact support",
      href: "/provider/settings/sales/card-machines",
    });
  }

  if (withoutMerchant > 0) {
    const merchantIssue = {
      code: "NO_MERCHANT" as const,
      title: "A card machine is missing merchant setup",
      actionLabel: "Contact support",
      href: "/provider/settings/sales/card-machines",
    };
    if (active > withoutMerchant) {
      warnings.push({
        code: "NO_MERCHANT",
        message:
          "One card machine still needs merchant setup. You can take payments on your other machines.",
      });
    } else {
      blockers.push(merchantIssue);
    }
  }

  if (accept && active > 0 && portableCount === 0) {
    warnings.push({
      code: "NO_PORTABLE",
      message: "No portable card machine — house calls may need a salon-bound device.",
    });
  }

  const { data: merchantRows } = await supabase
    .from("paycloud_terminals")
    .select("merchant:paycloud_merchants(environment)")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .neq("status", "suspended");
  const envSet = new Set<string>();
  for (const row of merchantRows ?? []) {
    const env = (row as { merchant?: { environment?: string } | null }).merchant?.environment;
    if (env) envSet.add(env);
  }
  let account_environment: PaycloudReadiness["account_environment"] = null;
  if (envSet.size === 1) {
    account_environment = [...envSet][0] as "sandbox" | "live";
  } else if (envSet.size > 1) {
    account_environment = "mixed";
    warnings.push({
      code: "MIXED_ENVIRONMENT",
      message:
        "You have both test and live card machines. Test payments can look like real ones — contact Beautonomi after go-live to retire sandbox machines.",
    });
  }

  const ready = blockers.length === 0;

  return {
    ready,
    blockers,
    warnings,
    terminals: { active, suspended, inFlight, withoutMerchant },
    settings: {
      accept,
      qr: (settings as { qr_payments_enabled?: boolean } | null)?.qr_payments_enabled ?? false,
      cashback: (settings as { cashback_enabled?: boolean } | null)?.cashback_enabled ?? false,
    },
    plan: {
      enabled: planAccess.enabled,
      maxTerminals: planAccess.maxTerminals ?? null,
      usedTerminals: rows.length,
    },
    account_environment,
  };
}
