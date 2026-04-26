import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

const preferenceLanguageZodEnum = z.enum(
  DEFAULT_SUPPORTED_LANGUAGE_CODES as unknown as [SupportedLanguage, ...SupportedLanguage[]],
);

const preferencesSchema = z.object({
  language: preferenceLanguageZodEnum.optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
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
        language: (() => {
          const raw = String(userData?.preferred_language || "en").trim() || "en";
          const baseRaw = (raw.split(/[-_]/)[0] || "en").toLowerCase();
          const supported = SUPPORTED_LANGUAGES.some((l) => l.code === baseRaw);
          return (supported ? baseRaw : DEFAULT_LANGUAGE) as SupportedLanguage;
        })(),
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
    if (validated.language !== undefined) updateData.preferred_language = validated.language;
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
