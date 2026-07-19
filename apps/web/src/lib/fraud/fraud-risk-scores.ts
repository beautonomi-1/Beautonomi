/** Deterministic risk scores for auto-opened fraud signals. */
export const FRAUD_RISK = {
  PSP_CHARGEBACK: 85,
  DIDIT_REJECTED: 80,
  DIDIT_NAME_MISMATCH: 80,
  SAFETY_FRAUD_TICKET: 55,
} as const;

export type FraudSignalKind =
  | "psp.chargeback"
  | "identity.rejected"
  | "identity.name_mismatch"
  | "support.safety_fraud"
  | "review_fraud_pattern";

export function riskScoreForSignal(signal: FraudSignalKind): number {
  switch (signal) {
    case "psp.chargeback":
      return FRAUD_RISK.PSP_CHARGEBACK;
    case "identity.rejected":
      return FRAUD_RISK.DIDIT_REJECTED;
    case "identity.name_mismatch":
      return FRAUD_RISK.DIDIT_NAME_MISMATCH;
    case "support.safety_fraud":
      return FRAUD_RISK.SAFETY_FRAUD_TICKET;
    case "review_fraud_pattern":
      return 50;
    default:
      return 50;
  }
}
