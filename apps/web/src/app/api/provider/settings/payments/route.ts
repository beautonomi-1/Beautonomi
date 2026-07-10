import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import {
  PROVIDER_MARKET_MISMATCH_MSG,
  providerTenantMismatchResponse,
} from "@/lib/tenant/provider-matches-host";
import type { UserRole } from "@/types/beautonomi";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { getPaystackTerminalAvailability } from "@/lib/payments/paystack-terminal-availability";
import {
  handlePaystackTerminalSettingsPost,
  loadPaystackTerminalMobileDetail,
} from "@/lib/payments/paystack-terminal-provider-mobile-api";

const PROVIDER_SETTINGS_ROLES = [
  "provider_owner",
  "provider_staff",
  "provider_onboarding",
  "superadmin",
] as const satisfies readonly UserRole[];

/**
 * GET /api/provider/settings/payments
 * Return payment settings for the current provider.
 * Reads from the `providers` table (tax_rate_percent, currency, is_vat_registered, vat_number),
 * `provider_settings` table, and `provider_yoco_integrations` table.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("paystack_terminal_detail") === "1") {
      return await loadPaystackTerminalMobileDetail(request);
    }

    const { user } = await requireRoleInApi([...PROVIDER_SETTINGS_ROLES], request);
    const supabase = await getSupabaseServer(request);
    const hostTenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get provider-level payment fields
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select(
        "tenant_id, currency, tax_rate_percent, is_vat_registered, vat_number, requires_deposit, deposit_percentage, no_show_fee_enabled, no_show_fee_amount, accept_cash, accept_card, accept_online, accept_paystack_terminal, accept_paycloud, tax_inclusive, tips_enabled, tip_presets, receipt_auto_send, tips_distribution"
      )
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    if (
      !resourceTenantMatchesHostTenant(
        hostTenantId,
        (provider as { tenant_id?: string | null }).tenant_id,
      )
    ) {
      return errorResponse(PROVIDER_MARKET_MISMATCH_MSG, "TENANT_MISMATCH", 403);
    }

    const effectiveTenantId =
      (provider as { tenant_id?: string | null }).tenant_id ?? hostTenantId;
    const yocoEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_YOCO, effectiveTenantId);
    const paycloudEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, effectiveTenantId);
    const paystackTerminalEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL,
      effectiveTenantId,
    );
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    // Get Yoco integration status
    const { data: yocoIntegration } = await supabase
      .from("provider_yoco_integrations")
      .select("is_enabled, public_key, connected_date")
      .eq("provider_id", providerId)
      .maybeSingle();

    const paystackTerminalAvailability = await getPaystackTerminalAvailability({
      supabase,
      providerId,
      tenantId: effectiveTenantId,
      accepted: provider.accept_paystack_terminal ?? false,
    });

    // Get platform settings for default tax rate
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .maybeSingle();

    const defaultTaxRate =
      platformSettings?.settings?.taxes?.default_tax_rate ?? 0;

    const result = {
      currency: provider.currency || lastResortCurrency,
      taxRatePercent: provider.tax_rate_percent ?? defaultTaxRate,
      isVatRegistered: provider.is_vat_registered ?? false,
      vatNumber: provider.vat_number || null,
      requiresDeposit: provider.requires_deposit ?? false,
      depositPercentage: provider.deposit_percentage ?? 0,
      noShowFeeEnabled: provider.no_show_fee_enabled ?? false,
      noShowFeeAmount: provider.no_show_fee_amount ?? 0,
      acceptCash: provider.accept_cash ?? true,
      acceptCard: yocoEnabled ? (provider.accept_card ?? true) : false,
      acceptOnline: provider.accept_online ?? false,
      acceptPaystackTerminal: paystackTerminalEnabled
        ? (provider.accept_paystack_terminal ?? false)
        : false,
      acceptPaycloud: paycloudEnabled ? (provider.accept_paycloud ?? false) : false,
      taxInclusive: provider.tax_inclusive ?? true,
      tipsEnabled: provider.tips_enabled ?? true,
      tipPresets: provider.tip_presets ?? [10, 15, 20, 25],
      receiptAutoSend: provider.receipt_auto_send ?? true,
      tipsDistribution: provider.tips_distribution ?? "staff",
      yoco: {
        isEnabled: yocoEnabled ? (yocoIntegration?.is_enabled ?? false) : false,
        publicKey: yocoEnabled ? (yocoIntegration?.public_key || null) : null,
        connectedDate: yocoEnabled ? (yocoIntegration?.connected_date || null) : null,
        platformEnabled: yocoEnabled,
      },
      paystackTerminal: {
        // isEnabled stays true when there is >=1 active terminal (backwards compatible),
        // while `selectable` is the single source of truth for showing the payment option.
        isEnabled: paystackTerminalAvailability.activeTerminalCount > 0,
        platformEnabled: paystackTerminalAvailability.platformEnabled,
        accepted: paystackTerminalAvailability.accepted,
        selectable: paystackTerminalAvailability.selectable,
        terminals: paystackTerminalAvailability.terminals,
        selectableTerminals: paystackTerminalAvailability.selectableTerminals,
        activeTerminalCount: paystackTerminalAvailability.activeTerminalCount,
      },
      paycloud: {
        platformEnabled: paycloudEnabled,
        accepted: paycloudEnabled ? (provider.accept_paycloud ?? false) : false,
      },
      defaultTaxRate,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load payment settings");
  }
}

/**
 * POST /api/provider/settings/payments
 * Paystack Terminal mobile fallback actions (`paystackTerminalAction`).
 */
export async function POST(request: NextRequest) {
  return handlePaystackTerminalSettingsPost(request);
}

/**
 * PATCH /api/provider/settings/payments
 * Update payment settings for the current provider.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...PROVIDER_SETTINGS_ROLES], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const mismatch = await providerTenantMismatchResponse(supabase, tenantId, providerId);
    if (mismatch) return mismatch;

    const yocoEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_YOCO, tenantId);
    const paycloudEnabled = await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PAYMENT_PAYCLOUD, tenantId);
    const paystackTerminalEnabled = await isFeatureEnabledServer(
      FEATURE_FLAG_KEYS.PAYMENT_PAYSTACK_VIRTUAL_TERMINAL,
      tenantId,
    );

    const updates: Record<string, any> = {};

    if (body.currency !== undefined) {
      updates.currency = body.currency;
    }
    if (body.taxRatePercent !== undefined) {
      updates.tax_rate_percent = Number(body.taxRatePercent);
    }
    if (body.isVatRegistered !== undefined) {
      updates.is_vat_registered = body.isVatRegistered;
    }
    if (body.vatNumber !== undefined) {
      updates.vat_number = body.vatNumber || null;
    }
    if (body.requiresDeposit !== undefined) {
      updates.requires_deposit = body.requiresDeposit;
    }
    if (body.depositPercentage !== undefined) {
      updates.deposit_percentage = Number(body.depositPercentage);
    }
    if (body.noShowFeeEnabled !== undefined) {
      updates.no_show_fee_enabled = body.noShowFeeEnabled;
    }
    if (body.noShowFeeAmount !== undefined) {
      updates.no_show_fee_amount = Number(body.noShowFeeAmount);
    }
    if (body.acceptCash !== undefined) {
      updates.accept_cash = body.acceptCash;
    }
    if (body.acceptCard !== undefined) {
      updates.accept_card = yocoEnabled ? body.acceptCard : false;
    }
    if (body.acceptOnline !== undefined) {
      updates.accept_online = body.acceptOnline;
    }
    if (body.acceptPaystackTerminal !== undefined) {
      updates.accept_paystack_terminal = paystackTerminalEnabled ? body.acceptPaystackTerminal : false;
    }
    if (body.acceptPaycloud !== undefined) {
      updates.accept_paycloud = paycloudEnabled ? body.acceptPaycloud : false;
    }
    if (body.taxInclusive !== undefined) {
      updates.tax_inclusive = body.taxInclusive;
    }
    if (body.tipsEnabled !== undefined) {
      updates.tips_enabled = body.tipsEnabled;
    }
    if (body.tipPresets !== undefined) {
      updates.tip_presets = body.tipPresets;
    }
    if (body.receiptAutoSend !== undefined) {
      updates.receipt_auto_send = body.receiptAutoSend;
    }
    if (body.tipsDistribution !== undefined) {
      updates.tips_distribution = body.tipsDistribution;
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .update(updates)
      .eq("id", providerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const onlineBookingUpdates: Record<string, any> = {};
    if (body.requiresDeposit !== undefined) {
      onlineBookingUpdates.deposit_required = body.requiresDeposit;
    }
    if (body.depositPercentage !== undefined) {
      onlineBookingUpdates.deposit_percent = Number(body.depositPercentage);
    }
    if (Object.keys(onlineBookingUpdates).length > 0) {
      const { error: onlineBookingError } = await supabase
        .from("provider_online_booking_settings")
        .upsert(
          {
            provider_id: providerId,
            ...onlineBookingUpdates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_id" },
        );
      if (onlineBookingError) {
        throw onlineBookingError;
      }
    }

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update payment settings");
  }
}
