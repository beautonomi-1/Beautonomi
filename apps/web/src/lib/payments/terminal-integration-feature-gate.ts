/**
 * Feature gate helpers for the generic terminal integrations hub.
 * Mirrors yoco-feature-gate.ts but is vendor-agnostic.
 *
 * Two-tier gating:
 *   1. TERMINAL_INTEGRATIONS (master hub switch)
 *   2. TERMINAL_VENDOR_<SLUG>  (per-vendor gate)
 *
 * Both must be enabled for a vendor to be usable.
 * Superadmin can toggle either independently.
 */

import { NextResponse } from "next/server";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";

// ── Error codes ───────────────────────────────────────────────────────────────

export const TERMINAL_INTEGRATIONS_DISABLED_CODE = "TERMINAL_INTEGRATIONS_DISABLED";
export const TERMINAL_VENDOR_DISABLED_CODE = "TERMINAL_VENDOR_DISABLED";

// ── Per-vendor flag key lookup ────────────────────────────────────────────────

/** Map from vendor slug → FEATURE_FLAG_KEYS constant value. */
const VENDOR_FLAG_MAP: Record<string, string> = {
  wappoint:      FEATURE_FLAG_KEYS.TERMINAL_VENDOR_WAPPOINT,
  ikhokha:       FEATURE_FLAG_KEYS.TERMINAL_VENDOR_IKHOKHA,
  fnb:           FEATURE_FLAG_KEYS.TERMINAL_VENDOR_FNB,
  capitec:       FEATURE_FLAG_KEYS.TERMINAL_VENDOR_CAPITEC,
  nedbank:       FEATURE_FLAG_KEYS.TERMINAL_VENDOR_NEDBANK,
  absa:          FEATURE_FLAG_KEYS.TERMINAL_VENDOR_ABSA,
  standard_bank: FEATURE_FLAG_KEYS.TERMINAL_VENDOR_STANDARD_BANK,
};

/**
 * Returns the feature flag key for a given vendor slug.
 * Returns null when the vendor does not have a dedicated flag (future vendors
 * are controlled via terminal_vendor_configs.enabled only).
 */
export function getVendorFlagKey(vendor: string): string | null {
  return VENDOR_FLAG_MAP[vendor] ?? null;
}

// ── Response helpers ──────────────────────────────────────────────────────────

export function terminalIntegrationsDisabledResponse(
  message = "Terminal integrations are not available for your account.",
): NextResponse {
  return NextResponse.json(
    { data: null, error: { message, code: TERMINAL_INTEGRATIONS_DISABLED_CODE } },
    { status: 403 },
  );
}

export function terminalVendorDisabledResponse(vendor: string): NextResponse {
  return NextResponse.json(
    {
      data: null,
      error: {
        message: `The ${vendor} terminal integration is not currently available.`,
        code: TERMINAL_VENDOR_DISABLED_CODE,
        vendor,
      },
    },
    { status: 403 },
  );
}

// ── Tenant resolution ─────────────────────────────────────────────────────────

async function resolveTenantId(supabase: any, providerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  return (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
}

// ── Hub gate ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the master terminal integrations hub flag is enabled
 * for the provider's tenant.
 */
export async function isTerminalIntegrationsEnabled(
  supabase: any,
  providerId: string,
): Promise<boolean> {
  const tenantId = await resolveTenantId(supabase, providerId);
  return isFeatureEnabledServer(FEATURE_FLAG_KEYS.TERMINAL_INTEGRATIONS, tenantId);
}

/**
 * Returns a 403 NextResponse when the hub is disabled, or null when enabled.
 * Use at the top of every /api/provider/terminal-integrations/* route.
 */
export async function requireTerminalIntegrationsEnabled(
  supabase: any,
  providerId: string,
): Promise<NextResponse | null> {
  const ok = await isTerminalIntegrationsEnabled(supabase, providerId);
  return ok ? null : terminalIntegrationsDisabledResponse();
}

// ── Per-vendor gate ────────────────────────────────────────────────────────────

/**
 * Returns true when:
 *   (a) the master hub flag is on, AND
 *   (b) the per-vendor flag is on (or the vendor has no dedicated flag — e.g. a
 *       future vendor configured only via terminal_vendor_configs.enabled).
 */
export async function isVendorIntegrationEnabled(
  supabase: any,
  providerId: string,
  vendor: string,
): Promise<{ hubEnabled: boolean; vendorEnabled: boolean; enabled: boolean }> {
  const tenantId = await resolveTenantId(supabase, providerId);
  const hubEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.TERMINAL_INTEGRATIONS, tenantId);
  if (!hubEnabled) return { hubEnabled: false, vendorEnabled: false, enabled: false };

  const flagKey = getVendorFlagKey(vendor);
  const vendorEnabled = flagKey
    ? await isFeatureEnabledServer(flagKey, tenantId)
    : true; // No dedicated flag = controlled via terminal_vendor_configs.enabled only

  return { hubEnabled, vendorEnabled, enabled: vendorEnabled };
}

/**
 * Returns a 403 NextResponse when either the hub or vendor gate is off,
 * or null when both are enabled.
 * Use at the top of /api/provider/terminal-integrations/[vendor]/* routes.
 */
export async function requireVendorIntegrationEnabled(
  supabase: any,
  providerId: string,
  vendor: string,
): Promise<NextResponse | null> {
  const { hubEnabled, vendorEnabled } = await isVendorIntegrationEnabled(supabase, providerId, vendor);
  if (!hubEnabled) return terminalIntegrationsDisabledResponse();
  if (!vendorEnabled) return terminalVendorDisabledResponse(vendor);
  return null;
}
