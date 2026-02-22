import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/platform-settings
 * 
 * Get platform-wide locale and currency settings (public endpoint)
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    // Get platform settings
    const { data: settings, error } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is okay for first time setup
      console.error("Error fetching platform settings:", error);
    }

    // Get currency info if currency code is set
    let currencyInfo = null;
    if (settings?.localization?.default_currency) {
      const { data: currency } = await supabase
        .from("iso_currencies")
        .select("code, symbol, name, decimal_places")
        .eq("code", settings.localization.default_currency)
        .eq("is_active", true)
        .single();

      if (currency) {
        currencyInfo = currency;
      }
    }

    // Merge settings with currency info
    const response = {
      default_currency: settings?.localization?.default_currency || "ZAR",
      default_language: settings?.localization?.default_language || "en",
      timezone: settings?.localization?.timezone || "Africa/Johannesburg",
      supported_currencies: settings?.localization?.supported_currencies || ["ZAR", "USD", "EUR"],
      supported_languages: settings?.localization?.supported_languages || ["en", "af", "zu"],
      currency_info: currencyInfo || {
        code: settings?.localization?.default_currency || "ZAR",
        symbol: "R",
        name: "South African Rand",
        decimal_places: 2,
      },
    };

    return NextResponse.json({
      data: response,
      error: null,
    });
  } catch (error: any) {
    console.error("Unexpected error in /api/public/platform-settings:", error);
    return NextResponse.json(
      {
        data: {
          default_currency: "ZAR",
          default_language: "en",
          timezone: "Africa/Johannesburg",
          supported_currencies: ["ZAR", "USD", "EUR"],
          supported_languages: ["en", "af", "zu"],
          currency_info: {
            code: "ZAR",
            symbol: "R",
            name: "South African Rand",
            decimal_places: 2,
          },
        },
        error: null,
      },
      { status: 200 } // Return defaults even on error
    );
  }
}
