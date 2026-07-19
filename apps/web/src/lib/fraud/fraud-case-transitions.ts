export type FraudCaseStatus = "open" | "review" | "held" | "released" | "closed";

const ALLOWED: Record<FraudCaseStatus, FraudCaseStatus[]> = {
  open: ["review", "held", "closed"],
  review: ["held", "released", "closed"],
  held: ["released", "closed"],
  released: ["closed"],
  closed: [],
};

export function isValidFraudCaseTransition(from: FraudCaseStatus, to: FraudCaseStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function requiresDecisionNotes(status: FraudCaseStatus): boolean {
  return status === "closed" || status === "released";
}
