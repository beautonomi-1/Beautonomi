/** Deposit-aware charge amount for a booking (shared web/mobile semantics). */
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

/** When a booking/group already has checkout tip, terminal collect must not add tip again. */
export function paycloudTipIncludedInChargeAmount(tipAmount: number | null | undefined): boolean {
  return Number(tipAmount ?? 0) > 0.01;
}
