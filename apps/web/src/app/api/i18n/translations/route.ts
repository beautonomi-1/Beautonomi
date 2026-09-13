import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from "@/lib/i18n/config";
import { resources } from "@beautonomi/i18n/resources";

/**
 * GET /api/i18n/translations?lang=fr
 * Returns the bundled translation namespace for a language (legacy mobile/web clients).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lang = normalizeLanguageCode(searchParams.get("lang") || DEFAULT_LANGUAGE) as SupportedLanguage;

    const bundle = resources[lang as keyof typeof resources] ?? resources.en;

    return successResponse({
      language: lang,
      translations: bundle.translation,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch translations");
  }
}
