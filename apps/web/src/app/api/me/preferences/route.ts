import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguageCode,
  normalizeLanguageCode,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

// Any bundled locale (Wave A or B) is persistable — tourists keep German on .co.za.
const preferenceLanguageSchema = z
  .string()
  .trim()
  .refine((v) => isSupportedLanguageCode(v), { message: "Unsupported language code" })
  .transform((v) => normalizeLanguageCode(v) as SupportedLanguage);

const preferencesSchema = z.object({
  language: preferenceLanguageSchema.optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Invalid currency code").transform((v) => v.toUpperCase()).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});

/**
 * GET /api/me/preferences
 * 
 * Get user preferences
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);

    // Align with `users` columns and PATCH /api/me/profile (preferred_* not legacy language/currency).
    const { data: userData } = await supabase
      .from("users")
      .select("preferred_language, preferred_currency, timezone")
      .eq("id", user.id)
      .single();

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    return successResponse({
      preferences: {
        language: normalizeLanguageCode(userData?.preferred_language || DEFAULT_LANGUAGE) as SupportedLanguage,
        currency: userData?.preferred_currency || lastResortCurrency,
        timezone: userData?.timezone || "Africa/Johannesburg",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch preferences");
  }
}

/**
 * POST /api/me/preferences
 * 
 * Update user preferences
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthInApi(request);
    const supabase = await getSupabaseServer(request);
    const body = await request.json();

    const validated = preferencesSchema.parse(body);

    const updateData: Record<string, string> = {};
    if (validated.language !== undefined) {
      updateData.preferred_language = validated.language;
    }
    if (validated.currency !== undefined) updateData.preferred_currency = validated.currency;
    if (validated.timezone !== undefined) updateData.timezone = validated.timezone;

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id);

    if (error) {
      throw error;
    }

    return successResponse({
      message: "Preferences updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(
        new Error(error.issues.map((e) => e.message).join(", ")),
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }
    return handleApiError(error, "Failed to update preferences");
  }
}
