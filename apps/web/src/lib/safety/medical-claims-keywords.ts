/** Keywords that may indicate unverified medical or therapeutic claims in UGC. */
export const MEDICAL_CLAIMS_KEYWORDS = [
  "cure",
  "cures",
  "cured",
  "treat",
  "treats",
  "treatment for",
  "diagnose",
  "diagnosis",
  "fda approved",
  "fda-approved",
  "guaranteed results",
  "100% effective",
  "clinically proven",
  "medical grade",
  "prescription strength",
  "heals",
  "reverse aging",
  "permanent fix",
  "eliminates pain",
  "cancer",
  "eczema cure",
  "psoriasis cure",
  "acne cure",
] as const;

export const MEDICAL_CLAIMS_MODERATION_NOTE =
  "Auto-flagged: caption may contain unverified medical or therapeutic claims. Review for compliance.";

export function captionHasMedicalClaims(
  text: string | null | undefined
): boolean {
  if (!text || !text.trim()) return false;
  const lower = text.toLowerCase();
  return MEDICAL_CLAIMS_KEYWORDS.some((term) => lower.includes(term));
}

export function moderationNotesForMedicalClaims(
  existingNotes: string | null | undefined,
  caption: string | null | undefined
): string | null {
  if (!captionHasMedicalClaims(caption)) return existingNotes ?? null;
  if (existingNotes?.includes(MEDICAL_CLAIMS_MODERATION_NOTE)) {
    return existingNotes;
  }
  return existingNotes
    ? `${existingNotes}\n${MEDICAL_CLAIMS_MODERATION_NOTE}`
    : MEDICAL_CLAIMS_MODERATION_NOTE;
}
