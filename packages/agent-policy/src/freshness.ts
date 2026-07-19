export type FreshnessField =
  | "kyc_status"
  | "available_balance"
  | "fraud_flags"
  | "reconciliation_status"
  | "bank_account_hash"
  | "approved_amount";

export type ActionFreshnessPolicy = {
  actionType: string;
  reloadAtExecution: FreshnessField[];
  immutableFields: string[];
  materialChangeTriggersReapproval: FreshnessField[];
};

export const ACTION_FRESHNESS_POLICIES: Record<string, ActionFreshnessPolicy> = {
  "payout.approve": {
    actionType: "payout.approve",
    reloadAtExecution: ["kyc_status", "available_balance", "fraud_flags", "reconciliation_status", "bank_account_hash"],
    immutableFields: ["approved_amount"],
    materialChangeTriggersReapproval: ["bank_account_hash", "available_balance", "fraud_flags"],
  },
  "refund.propose": {
    actionType: "refund.propose",
    reloadAtExecution: ["available_balance", "fraud_flags"],
    immutableFields: ["approved_amount"],
    materialChangeTriggersReapproval: ["available_balance"],
  },
};

export function materialDataChanged(
  actionType: string,
  before: Partial<Record<FreshnessField, string>>,
  after: Partial<Record<FreshnessField, string>>,
): boolean {
  const policy = ACTION_FRESHNESS_POLICIES[actionType];
  if (!policy) return false;
  return policy.materialChangeTriggersReapproval.some((f) => before[f] !== after[f]);
}
