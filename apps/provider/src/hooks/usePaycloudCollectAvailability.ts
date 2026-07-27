import { useMemo } from "react";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import {
  usePayCloudSettings,
  type PayCloudReadinessBlocker,
  type PayCloudReadinessWarning,
} from "@/hooks/usePayCloud";

export interface PaycloudCollectAvailability {
  paycloudEnabled: boolean;
  available: boolean;
  inFlight: boolean;
  collectEnabled: boolean;
  blockers: PayCloudReadinessBlocker[];
  warnings: PayCloudReadinessWarning[];
  primaryBlocker: PayCloudReadinessBlocker | null;
  loading: boolean;
}

export function usePaycloudCollectAvailability(): PaycloudCollectAvailability {
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { settings, loading } = usePayCloudSettings();

  return useMemo(() => {
    const blockers = settings?.blockers ?? [];
    const warnings = settings?.warnings ?? [];
    const inFlight = (settings?.terminals?.inFlight ?? 0) > 0;
    const available = paycloudEnabled && Boolean(settings?.ready);
    const collectEnabled = paycloudEnabled && (available || inFlight);
    const primaryBlocker = blockers[0] ?? null;

    return {
      paycloudEnabled,
      available,
      inFlight,
      collectEnabled,
      blockers,
      warnings,
      primaryBlocker,
      loading,
    };
  }, [paycloudEnabled, settings, loading]);
}

/** Deposit-aware charge amount for a booking (mirrors Yoco terminal sizing). */
export function computePaycloudBookingChargeAmount(params: {
  outstanding: number;
  depositRequired?: boolean;
  depositAmount?: number | null;
  totalPaid?: number;
  unpaidAdditionalCharges?: number;
}): { chargeAmount: number; depositAmount: number | null; fullOutstanding: number } {
  const fullOutstanding = Math.max(0, Number(params.outstanding) || 0);
  const totalPaid = Math.max(0, Number(params.totalPaid) || 0);
  const configuredDeposit = Math.max(0, Number(params.depositAmount) || 0);
  const unpaidAdditional = Math.max(0, Number(params.unpaidAdditionalCharges) || 0);

  const depositStillDue =
    params.depositRequired &&
    configuredDeposit > 0 &&
    totalPaid + 0.01 < configuredDeposit &&
    unpaidAdditional <= 0.01
      ? Math.min(configuredDeposit - totalPaid, fullOutstanding)
      : null;

  const depositAmount =
    depositStillDue != null && depositStillDue > 0.01
      ? Math.round(depositStillDue * 100) / 100
      : null;

  const chargeAmount =
    depositAmount != null && depositAmount > 0.01 ? depositAmount : fullOutstanding;

  return { chargeAmount, depositAmount, fullOutstanding };
}
