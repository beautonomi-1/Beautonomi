export type PlatformFeePaidBy = "customer" | "platform" | "provider" | string;

export interface LegacyPlatformFeeFields {
  platform_fee_amount?: number | string | null;
  platform_fee_percentage?: number | string | null;
  platform_fee_config_id?: string | null;
  platform_fee_paid_by?: PlatformFeePaidBy | null;
  service_fee_amount?: number | string | null;
  service_fee_percentage?: number | string | null;
  service_fee_config_id?: string | null;
  service_fee_paid_by?: PlatformFeePaidBy | null;
}

export interface CanonicalPlatformFeeFields {
  platform_fee_amount: number;
  platform_fee_percentage: number;
  platform_fee_config_id: string | null;
  platform_fee_paid_by: PlatformFeePaidBy | null;
  /** @deprecated Legacy persistence alias for platform_fee_amount. */
  service_fee_amount: number;
  /** @deprecated Legacy persistence alias for platform_fee_percentage. */
  service_fee_percentage: number;
  /** @deprecated Legacy persistence alias for platform_fee_config_id. */
  service_fee_config_id: string | null;
  /** @deprecated Legacy persistence alias for platform_fee_paid_by. */
  service_fee_paid_by: PlatformFeePaidBy | null;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Canonicalizes booking fee fields where legacy DB columns are still named
 * service_fee_* even though the business concept is a customer-paid Platform Fee.
 */
export function normalizePlatformFeeFields<T extends LegacyPlatformFeeFields>(
  row: T,
): T & CanonicalPlatformFeeFields {
  const platformFeeAmount = toNumber(row.platform_fee_amount ?? row.service_fee_amount);
  const platformFeePercentage = toNumber(row.platform_fee_percentage ?? row.service_fee_percentage);
  const platformFeeConfigId = row.platform_fee_config_id ?? row.service_fee_config_id ?? null;
  const platformFeePaidBy = row.platform_fee_paid_by ?? row.service_fee_paid_by ?? null;

  return {
    ...row,
    platform_fee_amount: platformFeeAmount,
    platform_fee_percentage: platformFeePercentage,
    platform_fee_config_id: platformFeeConfigId,
    platform_fee_paid_by: platformFeePaidBy,
    service_fee_amount: platformFeeAmount,
    service_fee_percentage: platformFeePercentage,
    service_fee_config_id: platformFeeConfigId,
    service_fee_paid_by: platformFeePaidBy,
  };
}
