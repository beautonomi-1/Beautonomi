import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findVerificationCountry,
  mergeVerificationCountries,
  STATIC_VERIFICATION_COUNTRIES,
  type VerificationCountryOption,
} from "@beautonomi/utils";

export type ResolvedVerificationCountry = {
  code: string;
  name: string;
};

export type ResolveVerificationCountryResult = {
  /** Resolved country, or null when input was missing/unrecognized. */
  country: ResolvedVerificationCountry | null;
  /** Error message; only set when country is null. */
  message: string | null;
};

async function loadActiveCountries(
  supabase: SupabaseClient,
): Promise<VerificationCountryOption[]> {
  const { data, error } = await supabase
    .from("iso_countries")
    .select("code, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.warn("[resolveVerificationCountry] iso_countries lookup failed:", error.message);
    return STATIC_VERIFICATION_COUNTRIES;
  }

  return mergeVerificationCountries(data ?? []);
}

/**
 * Normalize a submitted country to a canonical ISO code + display name.
 * Accepts ISO codes or exact country names from `iso_countries` / static fallback.
 */
export async function resolveVerificationCountry(
  supabase: SupabaseClient,
  raw: string | null | undefined,
): Promise<ResolveVerificationCountryResult> {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { country: null, message: "Country of issue is required." };
  }

  const countries = await loadActiveCountries(supabase);
  const matched = findVerificationCountry(countries, trimmed);
  if (matched) {
    return { country: { code: matched.code, name: matched.name }, message: null };
  }

  // Exact name match against the database when static fallback missed (e.g. long tail countries).
  if (!/^[A-Za-z]{2}$/.test(trimmed)) {
    const { data: row } = await supabase
      .from("iso_countries")
      .select("code, name")
      .eq("is_active", true)
      .ilike("name", trimmed)
      .maybeSingle();

    if (row?.code && row?.name) {
      return { country: { code: row.code, name: row.name }, message: null };
    }
  }

  return {
    country: null,
    message: "Select a valid country of issue from the list.",
  };
}
