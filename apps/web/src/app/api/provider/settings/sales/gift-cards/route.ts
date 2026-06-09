import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getPlatformSalesDefaults } from "@/lib/platform-sales-settings";
import type { UserRole } from "@/types/beautonomi";
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";

const PROVIDER_SETTINGS_ROLES = [
  "provider_owner",
  "provider_staff",
  "provider_onboarding",
  "superadmin",
] as const satisfies readonly UserRole[];

const patchSchema = z.object({
  gift_cards_enabled: z.boolean(),
  custom_min_value: z.number().nullable().optional(),
  custom_max_value: z.number().nullable().optional(),
  custom_expiry_months: z.number().nullable().optional(),
});

/**
 * GET /api/provider/settings/sales/gift-cards
 * Get gift card settings
 * Uses platform defaults if provider hasn't set a custom value.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...PROVIDER_SETTINGS_ROLES], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    // Get platform defaults
    const platformDefaults = await getPlatformSalesDefaults();

    if (!providerId) {
      return successResponse({
        enabled: platformDefaults.gift_cards_enabled ?? false,
        terms: platformDefaults.gift_card_terms ?? null,
        isUsingPlatformDefault: true,
      });
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("gift_cards_enabled, custom_gift_card_min_value, custom_gift_card_max_value, custom_gift_card_expiry_months")
      .eq("id", providerId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    const providerEnabled = provider?.gift_cards_enabled;
    const isUsingPlatformDefault = providerEnabled === null || providerEnabled === undefined;
    const enabled = isUsingPlatformDefault 
      ? (platformDefaults.gift_cards_enabled ?? false)
      : providerEnabled;

    return successResponse({
      enabled: enabled ?? false,
      terms: platformDefaults.gift_card_terms ?? null,
      isUsingPlatformDefault,
      min_value: (platformDefaults as any).gift_card_min_value ?? 50,
      max_value: (platformDefaults as any).gift_card_max_value ?? 5000,
      default_expiry_months: (platformDefaults as any).gift_card_expiry_months ?? 36,
      custom_min_value: provider?.custom_gift_card_min_value ?? null,
      custom_max_value: provider?.custom_gift_card_max_value ?? null,
      custom_expiry_months: provider?.custom_gift_card_expiry_months ?? null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load gift card settings");
  }
}

/**
 * PATCH /api/provider/settings/sales/gift-cards
 * Update gift card settings
 */
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi([...PROVIDER_SETTINGS_ROLES], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error("Provider not found"),
        "Provider not found",
        "NOT_FOUND",
        404
      );
    }

    const body = patchSchema.parse(await request.json());

    if (body.gift_cards_enabled) {
      const giftCardsOk = await checkNewGateFeatureAccess(
        providerId,
        SUBSCRIPTION_FEATURE_KEYS.giftCards,
        supabase,
      );
      if (!giftCardsOk) {
        return errorResponse(
          "Gift cards are not included in your current subscription plan. Upgrade to enable gift card sales.",
          "SUBSCRIPTION_FEATURE_DISABLED",
          403,
        );
      }
    }

    const { data, error } = await supabase
      .from("providers")
      .update({
        gift_cards_enabled: body.gift_cards_enabled,
        custom_gift_card_min_value: body.custom_min_value ?? null,
        custom_gift_card_max_value: body.custom_max_value ?? null,
        custom_gift_card_expiry_months: body.custom_expiry_months ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", providerId)
      .select("gift_cards_enabled, custom_gift_card_min_value, custom_gift_card_max_value, custom_gift_card_expiry_months")
      .single();

    if (error) {
      throw error;
    }

    // Get platform defaults for terms
    const platformDefaults = await getPlatformSalesDefaults();

    return successResponse({
      enabled: data?.gift_cards_enabled ?? false,
      terms: platformDefaults.gift_card_terms ?? null,
      isUsingPlatformDefault: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid request data", "VALIDATION_ERROR", 400, error.issues);
    }
    return handleApiError(error, "Failed to update gift card settings");
  }
}
