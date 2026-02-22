import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAuthInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";
import type { SupportedLanguage } from "@/lib/i18n/config";

const preferencesSchema = z.object({
  language: z.enum(["en", "af", "zu", "xh", "nso", "tn", "ts", "ve", "ss"]).optional(),
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
    const supabase = await getSupabaseServer();

    // Get user preferences (would need preferences table or user table columns)
    const { data: userData } = await supabase
      .from("users")
      .select("language, currency, timezone")
      .eq("id", user.id)
      .single();

    return successResponse({
      preferences: {
        language: (userData?.language as SupportedLanguage) || "en",
        currency: userData?.currency || "ZAR",
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
    const supabase = await getSupabaseServer();
    const body = await request.json();

    const validated = preferencesSchema.parse(body);

    // Update user preferences (would need preferences table or user table columns)
    const updateData: any = {};
    if (validated.language !== undefined) updateData.language = validated.language;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
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
