import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkPaycloudFeatureAccess } from "@/lib/subscriptions/feature-access";
import { resolveAcceptPaycloud } from "@/lib/payments/paycloud-accept";
import { resolvePaycloudAppCredentialsDetailed } from "@/lib/payments/resolve-paycloud-app-credentials";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";

export type PaycloudReadinessBlockerCode =
  | "FLAG_OFF"
  | "PLAN_REQUIRED"
  | "NOT_ACCEPTED"
  | "NO_TERMINALS"
  | "ALL_SUSPENDED"
  | "NO_MERCHANT"
  | "NO_CREDENTIALS";

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
  /** Successful sandbox captures not yet voided/refunded (settled like live). */
  unreversed_test_payments?: number;
}

async function countUnreversedSandboxPayments(
  supabase: SupabaseClient,
  providerId: string,
): Promise<number> {
  const { data: sandboxRows } = await supabase
    .from("provider_paycloud_payments")
    .select("id, metadata")
    .eq("provider_id", providerId)
    .eq("environment", "sandbox")
    .eq("status", "successful")
    .eq("trans_type", 1);

  if (!sandboxRows?.length) return 0;

  const ids = sandboxRows.map((r) => r.id);
  const { data: reversals } = await supabase
    .from("provider_paycloud_payments")
    .select("metadata")
    .eq("provider_id", providerId)
    .in("trans_type", [2, 3])
    .in("status", ["pending", "processing", "successful"]);

  const reversedOf = new Set<string>();
  for (const row of reversals ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.void_of_payment_id === "string") reversedOf.add(meta.void_of_payment_id);
    if (typeof meta.refund_of_payment_id === "string") reversedOf.add(meta.refund_of_payment_id);
  }

  return sandboxRows.filter((r) => !reversedOf.has(r.id)).length;
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
  const flagOn = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, tenantId);
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

  const accept = resolveAcceptPaycloud(
    provider as { accept_paycloud?: boolean | null },
    settings as { accept_paycloud?: boolean | null } | null,
  );
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
    .select("id, status, is_active, in_flight_payment_id, paycloud_merchant_id, location_id, display_name")
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

  const admin = getSupabaseAdmin();
  const { data: merchantRows } = await supabase
    .from("paycloud_terminals")
    .select("display_name, merchant:paycloud_merchants(environment, tenant_id, paycloud_app_id, is_active)")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .neq("status", "suspended");

  const envSet = new Set<string>();
  const sandboxMachineNames: string[] = [];
  let credentialsChecked = false;
  let hasUsableCredentials = false;

  for (const row of merchantRows ?? []) {
    const merchant = (row as {
      display_name?: string;
      merchant?: {
        environment?: string;
        tenant_id?: string | null;
        paycloud_app_id?: string | null;
        is_active?: boolean;
      } | null;
    }).merchant;
    const env = merchant?.environment;
    if (env) {
      envSet.add(env);
      if (env === "sandbox") {
        sandboxMachineNames.push(
          (row as { display_name?: string }).display_name ?? "Test card machine",
        );
      }
    }
    if (merchant?.is_active && env && !credentialsChecked) {
      credentialsChecked = true;
      const cred = await resolvePaycloudAppCredentialsDetailed(admin, {
        environment: env as PaycloudEnvironment,
        tenantId: merchant.tenant_id ?? tenantId,
        paycloudAppId: merchant.paycloud_app_id,
      });
      hasUsableCredentials = cred.ok;
    }
  }

  if (credentialsChecked && !hasUsableCredentials) {
    blockers.push({
      code: "NO_CREDENTIALS",
      title: "Beautonomi is finishing your card machine account",
      actionLabel: "Contact Beautonomi",
    });
  }

  let account_environment: PaycloudReadiness["account_environment"] = null;
  if (envSet.size === 1) {
    account_environment = [...envSet][0] as "sandbox" | "live";
  } else if (envSet.size > 1) {
    account_environment = "mixed";
    const names = sandboxMachineNames.length
      ? sandboxMachineNames.join(", ")
      : "your test machines";
    warnings.push({
      code: "MIXED_ENVIRONMENT",
      message: `You have both test and live card machines (${names}). Test payments still mark bookings paid — void them when done testing.`,
    });
  }

  const unreversedTest = await countUnreversedSandboxPayments(supabase, providerId);
  if (unreversedTest > 0) {
    warnings.push({
      code: "UNREVERSED_TEST_PAYMENTS",
      message: `${unreversedTest} test payment${unreversedTest === 1 ? "" : "s"} still need to be voided or refunded before go-live.`,
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
    unreversed_test_payments: unreversedTest,
  };
}
