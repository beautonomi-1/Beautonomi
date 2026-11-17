/**
 * Maps Postgres / PostgREST errors from money-path triggers and RPCs to a
 * stable 4xx API shape so web and the provider app can show the same message.
 *
 * Covers:
 *   F4-02  insert_payout_request_guarded INVALID_STATUS
 *   F2-22  validate_refund_amount check_violation (over-refund)
 *   F2-31  create_finance_ledger_from_payment fail-closed (P0001)
 *   F3-01  product/commission CHECK constraints
 */

export type MappedMoneySqlError = {
  message: string;
  code: string;
  status: number;
};

function readField(error: unknown, key: "message" | "code" | "details" | "hint"): string {
  if (error == null || typeof error !== "object") return "";
  const v = (error as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

export function mapMoneySqlError(error: unknown): MappedMoneySqlError | null {
  if (error == null) return null;
  const message = readField(error, "message");
  const pgCode = readField(error, "code");
  const details = readField(error, "details");
  const hint = readField(error, "hint");
  const blob = `${message}\n${details}\n${hint}\n${pgCode}`;

  if (/INSUFFICIENT_BALANCE/i.test(blob)) {
    return {
      message: "Insufficient payout balance for this request.",
      code: "INSUFFICIENT_BALANCE",
      status: 400,
    };
  }
  if (/PAYOUT_HELD/i.test(blob)) {
    return {
      message: "Payouts are temporarily on hold. Contact support if you need help.",
      code: "PAYOUT_HELD",
      status: 409,
    };
  }
  if (/INVALID_AMOUNT/i.test(blob)) {
    return {
      message: "Enter a valid amount within the allowed range.",
      code: "INVALID_AMOUNT",
      status: 400,
    };
  }
  if (/\bINVALID_STATUS\b/i.test(blob)) {
    return {
      message: "This payout cannot be created in that status. New requests must start as pending.",
      code: "INVALID_STATUS",
      status: 400,
    };
  }
  if (/finance ledger posting failed/i.test(blob) || /LEDGER_POSTING/i.test(blob)) {
    return {
      message:
        "The payment could not be recorded because the finance ledger failed to post. Retry the payment; if it was a card charge, the gateway will retry automatically.",
      code: "LEDGER_POSTING_FAILED",
      status: 409,
    };
  }
  if (
    /over-?refund|refund amount|validate_refund_amount|new_total_refunded/i.test(blob)
  ) {
    return {
      message: "Refund exceeds the amount collected on this booking.",
      code: "OVER_REFUND",
      status: 400,
    };
  }
  if (pgCode === "23514" || /check constraint|check_violation/i.test(blob)) {
    return {
      message: "This value is outside the allowed range.",
      code: "VALIDATION_ERROR",
      status: 400,
    };
  }
  if (pgCode === "23505" || /duplicate key/i.test(blob)) {
    return {
      message: "This record already exists. Refresh and try again.",
      code: "CONFLICT",
      status: 409,
    };
  }
  if (/period (is )?locked|enforce_finance_period_lock/i.test(blob)) {
    return {
      message: "This financial period is locked. Ask an admin to reopen it before changing money records.",
      code: "PERIOD_LOCKED",
      status: 409,
    };
  }
  return null;
}
