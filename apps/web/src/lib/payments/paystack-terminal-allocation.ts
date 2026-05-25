export type TerminalAllocationEntityType =
  | "booking"
  | "invoice"
  | "sale"
  | "product_order"
  | "group_booking"
  | "additional_charge"
  | "other";

export type TerminalAmountMatchStatus =
  | "exact_match"
  | "partial_payment"
  | "overpayment"
  | "zero_or_no_balance"
  | "amount_only_match"
  | "ambiguous_amount_match"
  | "mismatch"
  | "currency_mismatch"
  | "unmatched";

export type TerminalAllocationStatus =
  | "unmatched"
  | "suggested"
  | "provider_confirmed"
  | "provider_declined"
  | "allocated"
  | "split_allocated"
  | "admin_review"
  | "admin_resolved"
  | "refunded"
  | "disputed";

export type TerminalPaymentSuggestion = {
  entityType: TerminalAllocationEntityType | null;
  entityId: string | null;
  expectedAmount: number | null;
  amountDueAtMatchTime: number | null;
  amountDifference: number | null;
  amountMatchStatus: TerminalAmountMatchStatus;
  allocationStatus: TerminalAllocationStatus;
  confidence: number | null;
  reasons: string[];
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function classifyTerminalAmountMatch(params: {
  paidAmount: number;
  expectedAmount?: number | null;
  currency?: string | null;
  expectedCurrency?: string | null;
}): Pick<
  TerminalPaymentSuggestion,
  "amountMatchStatus" | "amountDifference" | "confidence" | "reasons"
> {
  const paidAmount = Number(params.paidAmount);
  const expectedAmount =
    params.expectedAmount === undefined || params.expectedAmount === null
      ? null
      : Number(params.expectedAmount);
  const reasons: string[] = [];

  if (
    params.currency &&
    params.expectedCurrency &&
    params.currency.toUpperCase() !== params.expectedCurrency.toUpperCase()
  ) {
    return {
      amountMatchStatus: "currency_mismatch",
      amountDifference: null,
      confidence: 0,
      reasons: ["currency_mismatch"],
    };
  }

  if (!expectedAmount || expectedAmount <= 0) {
    return {
      amountMatchStatus: expectedAmount === 0 ? "zero_or_no_balance" : "unmatched",
      amountDifference: null,
      confidence: expectedAmount === 0 ? 35 : 0,
      reasons: expectedAmount === 0 ? ["target_has_no_open_balance"] : ["no_expected_amount"],
    };
  }

  const difference = roundMoney(paidAmount - expectedAmount);
  if (Math.abs(difference) < 0.01) {
    reasons.push("amount_matches_open_balance");
    return {
      amountMatchStatus: "exact_match",
      amountDifference: 0,
      confidence: 95,
      reasons,
    };
  }

  if (difference < 0) {
    reasons.push("paid_less_than_open_balance");
    return {
      amountMatchStatus: "partial_payment",
      amountDifference: difference,
      confidence: 75,
      reasons,
    };
  }

  reasons.push("paid_more_than_open_balance");
  return {
    amountMatchStatus: "overpayment",
    amountDifference: difference,
    confidence: 70,
    reasons,
  };
}

export function buildUnmatchedTerminalSuggestion(params: {
  paidAmount: number;
  currency?: string | null;
}): TerminalPaymentSuggestion {
  const match = classifyTerminalAmountMatch({
    paidAmount: params.paidAmount,
    expectedAmount: null,
    currency: params.currency,
  });
  return {
    entityType: null,
    entityId: null,
    expectedAmount: null,
    amountDueAtMatchTime: null,
    allocationStatus: "unmatched",
    ...match,
  };
}

export function buildExplicitTerminalSuggestion(params: {
  entityType: TerminalAllocationEntityType;
  entityId: string;
  paidAmount: number;
  expectedAmount: number;
  currency?: string | null;
  expectedCurrency?: string | null;
}): TerminalPaymentSuggestion {
  const match = classifyTerminalAmountMatch(params);
  return {
    entityType: params.entityType,
    entityId: params.entityId,
    expectedAmount: params.expectedAmount,
    amountDueAtMatchTime: params.expectedAmount,
    allocationStatus:
      match.amountMatchStatus === "currency_mismatch" ? "admin_review" : "suggested",
    ...match,
  };
}
