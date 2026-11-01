import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_BOOKING_DISPLAY_TIMEZONE } from "@/lib/bookings/display-invariants";
import { combineDateAndTime, normalizeProviderTimezone } from "@/lib/availability/time-utils";

export type ProviderPromotionStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "used_up"
  | "off";

export type ProviderPromotionDto = {
  id: string;
  code: string;
  type: "percentage" | "fixed_amount";
  value: number;
  description?: string | null;
  is_active: boolean;
  public_on_profile?: boolean;
  start_date: string | null;
  end_date: string | null;
  usage_count: number;
  usage_limit: number | null;
  min_purchase_amount: number | null;
  max_discount_amount: number | null;
  once_per_customer: boolean;
  location_id: string | null;
  status: ProviderPromotionStatus;
  created_at?: string;
};

function resolveTz(providerTimezone?: string | null): string {
  return normalizeProviderTimezone(providerTimezone) ?? DEFAULT_BOOKING_DISPLAY_TIMEZONE;
}

/** Calendar day YYYY-MM-DD in provider timezone from a stored timestamptz. */
export function formatPromoCalendarDate(
  iso: string | null | undefined,
  providerTimezone?: string | null,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tz = resolveTz(providerTimezone);
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/** Start of calendar day in provider TZ → ISO UTC. */
export function promoStartInstantFromYmd(ymd: string, providerTimezone?: string | null): Date {
  return combineDateAndTime(ymd, "00:00:00", resolveTz(providerTimezone));
}

/** End of calendar day in provider TZ → ISO UTC. */
export function promoEndInstantFromYmd(ymd: string, providerTimezone?: string | null): Date {
  return combineDateAndTime(ymd, "23:59:59", resolveTz(providerTimezone));
}

export function computeProviderPromotionStatus(row: {
  is_active?: boolean | null;
  valid_from?: string | null;
  valid_until?: string | null;
  usage_count?: number | null;
  usage_limit?: number | null;
}): ProviderPromotionStatus {
  const now = Date.now();
  const validUntil = row.valid_until ? new Date(row.valid_until).getTime() : null;
  if (validUntil != null && !Number.isNaN(validUntil) && now > validUntil) {
    return "expired";
  }
  const usageCount = Number(row.usage_count ?? 0);
  const usageLimit = row.usage_limit;
  if (usageLimit != null && usageCount >= Number(usageLimit)) {
    return "used_up";
  }
  if (!row.is_active) {
    return "off";
  }
  const validFrom = row.valid_from ? new Date(row.valid_from).getTime() : null;
  if (validFrom != null && !Number.isNaN(validFrom) && now < validFrom) {
    return "scheduled";
  }
  return "active";
}

type PromotionRow = Record<string, unknown>;

export function mapPromotionRowToProviderDto(
  row: PromotionRow,
  providerTimezone?: string | null,
): ProviderPromotionDto {
  const dbType = String(row.type ?? "");
  const type: "percentage" | "fixed_amount" =
    dbType === "percentage" ? "percentage" : "fixed_amount";
  const usageCount = Number(row.usage_count ?? row.uses_count ?? 0);
  const usageLimit =
    row.usage_limit != null
      ? Number(row.usage_limit)
      : row.max_uses != null
        ? Number(row.max_uses)
        : null;

  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    type,
    value: Number(row.value ?? 0),
    description: (row.description as string | null | undefined) ?? null,
    is_active: Boolean(row.is_active),
    public_on_profile: row.public_on_profile !== undefined ? Boolean(row.public_on_profile) : true,
    start_date: formatPromoCalendarDate(row.valid_from as string | undefined, providerTimezone),
    end_date: formatPromoCalendarDate(row.valid_until as string | undefined, providerTimezone),
    usage_count: usageCount,
    usage_limit: usageLimit,
    min_purchase_amount:
      row.min_purchase_amount != null ? Number(row.min_purchase_amount) : null,
    max_discount_amount:
      row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
    once_per_customer: Boolean(row.once_per_customer ?? false),
    location_id: (row.location_id as string | null | undefined) ?? null,
    status: computeProviderPromotionStatus({
      is_active: row.is_active as boolean | undefined,
      valid_from: row.valid_from as string | undefined,
      valid_until: row.valid_until as string | undefined,
      usage_count: usageCount,
      usage_limit: usageLimit,
    }),
    created_at: row.created_at as string | undefined,
  };
}
