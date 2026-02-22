import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/settings/payments
 * Return payment settings for the current provider.
 * Reads from the `providers` table (tax_rate_percent, currency, is_vat_registered, vat_number),
 * `provider_settings` table, and `provider_yoco_integrations` table.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get provider-level payment fields
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select(
        "currency, tax_rate_percent, is_vat_registered, vat_number, requires_deposit, deposit_percentage, no_show_fee_enabled, no_show_fee_amount, accept_cash, accept_card, accept_online, tax_inclusive, tips_enabled, tip_presets, receipt_auto_send, tips_distribution"
      )
      .eq("id", providerId)
      .single();

    if (providerError) {
      throw providerError;
    }

    // Get Yoco integration status
    const { data: yocoIntegration } = await supabase
      .from("provider_yoco_integrations")
      .select("is_enabled, public_key, connected_date")
      .eq("provider_id", providerId)
      .maybeSingle();

    // Get platform settings for default tax rate
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .maybeSingle();

    const defaultTaxRate =
      platformSettings?.settings?.taxes?.default_tax_rate ?? 15;

    const result = {
      currency: provider.currency || "ZAR",
      taxRatePercent: provider.tax_rate_percent ?? defaultTaxRate,
      isVatRegistered: provider.is_vat_registered ?? false,
      vatNumber: provider.vat_number || null,
      requiresDeposit: provider.requires_deposit ?? false,
      depositPercentage: provider.deposit_percentage ?? 0,
      noShowFeeEnabled: provider.no_show_fee_enabled ?? false,
      noShowFeeAmount: provider.no_show_fee_amount ?? 0,
      acceptCash: provider.accept_cash ?? true,
      acceptCard: provider.accept_card ?? true,
      acceptOnline: provider.accept_online ?? false,
      taxInclusive: provider.tax_inclusive ?? true,
      tipsEnabled: provider.tips_enabled ?? true,
      tipPresets: provider.tip_presets ?? [10, 15, 20, 25],
      receiptAutoSend: provider.receipt_auto_send ?? true,
      tipsDistribution: provider.tips_distribution ?? "staff",
      yoco: {
        isEnabled: yocoIntegration?.is_enabled ?? false,
        publicKey: yocoIntegration?.public_key || null,
        connectedDate: yocoIntegration?.connected_date || null,
      },
      defaultTaxRate,
    };

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to load payment settings");
  }
}

/**
 * PATCH /api/provider/settings/payments
 * Update payment settings for the current provider.
 */
export async function PATCH(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const updates: Record<string, unknown> = {};

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
      updates.accept_card = body.acceptCard;
    }
    if (body.acceptOnline !== undefined) {
      updates.accept_online = body.acceptOnline;
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

    return successResponse(provider);
  } catch (error) {
    return handleApiError(error, "Failed to update payment settings");
  }
}
