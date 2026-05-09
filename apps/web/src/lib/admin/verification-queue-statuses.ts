/** Status values that represent identity verification still in the admin review queue (not terminal). */
export const USER_VERIFICATION_QUEUE_STATUSES = [
  "pending",
  "in_progress",
  "under_review",
  "submitted",
] as const;
