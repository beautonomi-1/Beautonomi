import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderTaxSettingsPatch = {
  tax_rate_percent?: number;
  is_vat_registered?: boolean;
  vat_number?: string | null;
  tax_inclusive?: boolean;
};

export type ApplyProviderTaxSettingsResult =
  | {
      ok: true;
      data: {
        tax_rate_percent: number;
        is_vat_registered: boolean;
        vat_number: string | null;
        tax_inclusive: boolean;
      };
    }
  | { ok: false; code: string; message: string; status: number };

/**
 * Single write path for provider VAT fields (used by sales/taxes and payments PATCH delegate).
 */
export async function applyProviderTaxSettingsPatch(
  supabase: SupabaseClient,
  providerId: string,
  body: ProviderTaxSettingsPatch,
): Promise<ApplyProviderTaxSettingsResult> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.is_vat_registered !== undefined) {
    updateData.is_vat_registered = body.is_vat_registered;

    if (body.is_vat_registered === true) {
      const { data: providerRow } = await supabase
        .from("providers")
        .select("country_code, tax_inclusive, vat_number")
        .eq("id", providerId)
        .maybeSingle();
      const { resolveProviderVat } = await import("@/lib/tax/resolve-provider-vat");
      const resolved = await resolveProviderVat(supabase, {
        is_vat_registered: true,
        country_code: (providerRow as { country_code?: string | null } | null)?.country_code ?? null,
        tax_inclusive: body.tax_inclusive ?? (providerRow as { tax_inclusive?: boolean | null } | null)?.tax_inclusive ?? true,
        vat_number: body.vat_number ?? (providerRow as { vat_number?: string | null } | null)?.vat_number ?? null,
        tax_rate_percent: null,
        tax_rate_override_percent: null,
      });
      if (resolved.source === "none" || resolved.ratePercent <= 0) {
        return {
          ok: false,
          code: "VAT_RATE_UNAVAILABLE",
          message: "No country VAT rate is configured for this provider. Registration was not saved.",
          status: 503,
        };
      }
      updateData.tax_rate_percent = resolved.ratePercent;
      if (!body.vat_number || String(body.vat_number).trim() === "") {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "VAT number is required when registering for VAT",
          status: 400,
        };
      }
      updateData.vat_number = String(body.vat_number).trim();
    } else {
      updateData.tax_rate_percent = 0;
      updateData.vat_number = null;
    }
  }

  if (body.vat_number !== undefined && body.is_vat_registered !== false) {
    if (body.vat_number && String(body.vat_number).trim() !== "") {
      const vatRegex = /^4\d{9}$/;
      const trimmed = String(body.vat_number).trim();
      if (!vatRegex.test(trimmed)) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message:
            "Invalid VAT number format. South African VAT numbers must be 10 digits starting with 4 (e.g., 4123456789)",
          status: 400,
        };
      }
      updateData.vat_number = trimmed;
    }
  }

  if (body.tax_inclusive !== undefined) {
    updateData.tax_inclusive = body.tax_inclusive;
  }

  if (Object.keys(updateData).length <= 1) {
    const { data, error } = await supabase
      .from("providers")
      .select("tax_rate_percent, is_vat_registered, vat_number, tax_inclusive")
      .eq("id", providerId)
      .single();
    if (error) {
      throw error;
    }
    return {
      ok: true,
      data: {
        tax_rate_percent: Number((data as { tax_rate_percent?: number | null })?.tax_rate_percent || 0),
        is_vat_registered: (data as { is_vat_registered?: boolean | null })?.is_vat_registered ?? false,
        vat_number: (data as { vat_number?: string | null })?.vat_number ?? null,
        tax_inclusive: (data as { tax_inclusive?: boolean | null })?.tax_inclusive ?? true,
      },
    };
  }

  const { data, error } = await supabase
    .from("providers")
    .update(updateData)
    .eq("id", providerId)
    .select("tax_rate_percent, is_vat_registered, vat_number, tax_inclusive")
    .single();

  if (error) {
    throw error;
  }

  return {
    ok: true,
    data: {
      tax_rate_percent: Number((data as { tax_rate_percent?: number | null })?.tax_rate_percent || 0),
      is_vat_registered: (data as { is_vat_registered?: boolean | null })?.is_vat_registered ?? false,
      vat_number: (data as { vat_number?: string | null })?.vat_number ?? null,
      tax_inclusive: (data as { tax_inclusive?: boolean | null })?.tax_inclusive ?? true,
    },
  };
}
