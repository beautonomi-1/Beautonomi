/** Matches apps/web/src/lib/admin/verification-queue-statuses.ts */
export const USER_VERIFICATION_QUEUE_STATUSES = [
  "pending",
  "in_progress",
  "under_review",
  "submitted",
] as const;

export function isUserVerificationQueueStatus(status: string): boolean {
  return (USER_VERIFICATION_QUEUE_STATUSES as readonly string[]).includes(status);
}
