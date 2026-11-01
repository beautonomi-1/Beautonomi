import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatPromoCalendarDate,
  mapPromotionRowToProviderDto,
  promoEndInstantFromYmd,
  promoStartInstantFromYmd,
  type ProviderPromotionDto,
} from "@/lib/promotions/provider-promotion";

export async function getProviderTimezoneAndTenant(
  supabase: SupabaseClient,
  providerId: string,
): Promise<{ timezone: string; tenantId: string } | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("tenant_id, timezone")
    .eq("id", providerId)
    .single();
  if (error || !data?.tenant_id) return null;
  return {
    tenantId: data.tenant_id as string,
    timezone: (data.timezone as string | null) ?? "Africa/Johannesburg",
  };
}

export function mapRowsToProviderDtos(
  rows: Record<string, unknown>[] | null,
  providerTimezone: string,
): ProviderPromotionDto[] {
  return (rows ?? []).map((r) => mapPromotionRowToProviderDto(r, providerTimezone));
}

export async function assertProviderOwnsLocation(
  supabase: SupabaseClient,
  providerId: string,
  locationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("provider_locations")
    .select("id")
    .eq("id", locationId)
    .eq("provider_id", providerId)
    .maybeSingle();
  return Boolean(data?.id);
}

export function resolveValidWindowFromBody(
  body: Record<string, unknown>,
  providerTimezone: string,
  options?: { forPatch?: boolean },
): { validFrom: Date; validUntil: Date | null } | { error: string } {
  const forPatch = options?.forPatch ?? false;

  if (body.no_end_date === true) {
    const startYmd =
      typeof body.start_date === "string" && body.start_date.trim()
        ? body.start_date.trim().slice(0, 10)
        : formatPromoCalendarDate(new Date().toISOString(), providerTimezone) ??
          new Date().toISOString().slice(0, 10);
    return {
      validFrom: promoStartInstantFromYmd(startYmd, providerTimezone),
      validUntil: null,
    };
  }

  if (typeof body.end_date === "string" && body.end_date.trim()) {
    const endYmd = body.end_date.trim().slice(0, 10);
    const startYmd =
      typeof body.start_date === "string" && body.start_date.trim()
        ? body.start_date.trim().slice(0, 10)
        : formatPromoCalendarDate(new Date().toISOString(), providerTimezone) ??
          new Date().toISOString().slice(0, 10);
    const validFrom = promoStartInstantFromYmd(startYmd, providerTimezone);
    const validUntil = promoEndInstantFromYmd(endYmd, providerTimezone);
    if (validUntil.getTime() <= validFrom.getTime()) {
      return { error: "End date must be after start date" };
    }
    return { validFrom, validUntil };
  }

  if (forPatch) {
    return { error: "PATCH_SKIP_DATES" };
  }

  const now = new Date();
  return {
    validFrom: now,
    validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
  };
}

export function parseOptionalLimit(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

export function parseOptionalAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n =
    typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, "."));
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}
