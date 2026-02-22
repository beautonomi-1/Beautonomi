import { NextRequest } from "next/server";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { translations, type SupportedLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n/config";

/**
 * GET /api/i18n/translations
 * 
 * Get translations for a specific language
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lang = (searchParams.get("lang") || DEFAULT_LANGUAGE) as SupportedLanguage;

    const langTranslations = translations[lang] || translations[DEFAULT_LANGUAGE];

    return successResponse({
      language: lang,
      translations: langTranslations,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch translations");
  }
}
