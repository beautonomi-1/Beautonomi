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

export type TerminalMatchCandidate = {
  entity_type: TerminalAllocationEntityType;
  entity_id: string;
  label: string | null;
  reference: string | null;
  expected_amount: number;
  amount_match_status: TerminalAmountMatchStatus;
  amount_difference: number | null;
  confidence: number;
  reasons: string[];
  occurred_at: string | null;
  created_at: string | null;
};

export type RawTerminalCandidate = {
  entityType: TerminalAllocationEntityType;
  entityId: string;
  label: string | null;
  reference?: string | null;
  expectedAmount: number;
  expectedCurrency?: string | null;
  occurredAt?: string | null;
  createdAt?: string | null;
};

/**
 * Rank open entities (bookings/orders) against an unattributed terminal payment using
 * amount-closeness first, then recency (an in-person payment usually settles the most
 * recent open ticket). Returns the ranked candidates and an overall suggestion:
 *  - exact amount + single candidate  -> exact_match / suggested
 *  - exact amount + multiple          -> ambiguous_amount_match / suggested (top by recency)
 *  - close amount only                -> amount_only_match
 *  - nothing plausible                -> unmatched
 */
export function rankTerminalCandidates(params: {
  paidAmount: number;
  currency?: string | null;
  rawCandidates: RawTerminalCandidate[];
  now?: number;
}): { suggestion: TerminalPaymentSuggestion; candidates: TerminalMatchCandidate[] } {
  const now = params.now ?? Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const scored: TerminalMatchCandidate[] = params.rawCandidates
    .map((candidate) => {
      const amount = classifyTerminalAmountMatch({
        paidAmount: params.paidAmount,
        expectedAmount: candidate.expectedAmount,
        currency: params.currency,
        expectedCurrency: candidate.expectedCurrency,
      });
      // Timing proximity: most weight to the same-hour, decaying over ~2 days.
      const occurred = candidate.occurredAt ?? candidate.createdAt;
      let timingBonus = 0;
      if (occurred) {
        const ageMs = Math.abs(now - new Date(occurred).getTime());
        timingBonus = Math.max(0, Math.round(12 * (1 - Math.min(ageMs, 2 * dayMs) / (2 * dayMs))));
      }
      const baseConfidence = amount.confidence ?? 0;
      const reasons = [...amount.reasons];
      if (timingBonus > 0) reasons.push("recent_activity");
      return {
        entity_type: candidate.entityType,
        entity_id: candidate.entityId,
        label: candidate.label,
        reference: candidate.reference ?? null,
        expected_amount: candidate.expectedAmount,
        amount_match_status: amount.amountMatchStatus,
        amount_difference: amount.amountDifference,
        confidence: Math.min(100, baseConfidence + timingBonus),
        reasons,
        occurred_at: candidate.occurredAt ?? null,
        created_at: candidate.createdAt ?? null,
      };
    })
    // Only keep plausible candidates (exact, partial, overpayment).
    .filter((candidate) =>
      ["exact_match", "partial_payment", "overpayment"].includes(candidate.amount_match_status),
    )
    .sort((a, b) => b.confidence - a.confidence);

  if (scored.length === 0) {
    return { suggestion: buildUnmatchedTerminalSuggestion({ paidAmount: params.paidAmount, currency: params.currency }), candidates: [] };
  }

  const exactMatches = scored.filter((candidate) => candidate.amount_match_status === "exact_match");
  const top = scored[0];
  const isAmbiguous = exactMatches.length > 1;
  const amountMatchStatus: TerminalAmountMatchStatus = isAmbiguous
    ? "ambiguous_amount_match"
    : top.amount_match_status === "exact_match"
      ? "exact_match"
      : "amount_only_match";

  const suggestion: TerminalPaymentSuggestion = {
    entityType: top.entity_type,
    entityId: top.entity_id,
    expectedAmount: top.expected_amount,
    amountDueAtMatchTime: top.expected_amount,
    amountDifference: top.amount_difference,
    amountMatchStatus,
    // Always require a one-tap provider confirm; we never silently allocate.
    allocationStatus: "suggested",
    confidence: isAmbiguous ? Math.min(top.confidence, 60) : top.confidence,
    reasons: isAmbiguous ? [...top.reasons, "multiple_amount_matches"] : top.reasons,
  };

  return { suggestion, candidates: scored.slice(0, 8) };
}
