/**
 * Resolve customer identity verification display fields for profile APIs.
 *
 * The `users` row is authoritative after admin reset or approval workflows.
 * Historical `user_verifications` rows may still show `approved` even when
 * `users.identity_verified` is false — do not let that block re-submission.
 */

const BLOCKING_STATUSES = new Set([
  "pending",
  "in_progress",
  "submitted",
  "under_review",
]);

export type LatestVerificationRow = {
  id?: string;
  status?: string;
  submitted_at?: string | null;
  rejection_reason?: string | null;
  document_url?: string | null;
  document_type?: string | null;
} | null;

export type IdentityVerificationUserRow = {
  identity_verified?: boolean | null;
  identity_verification_status?: string | null;
};

export function resolveIdentityVerificationDisplay(
  user: IdentityVerificationUserRow,
  latestVerification?: LatestVerificationRow,
) {
  const userStatus = user.identity_verification_status ?? "none";
  const identityVerified = Boolean(user.identity_verified);
  const verificationStatus = identityVerified ? "approved" : userStatus;

  const userBlocking = BLOCKING_STATUSES.has(userStatus);
  const recordBlocking = latestVerification?.status
    ? BLOCKING_STATUSES.has(latestVerification.status)
    : false;

  const can_submit_verification =
    !identityVerified && !userBlocking && !recordBlocking;

  const showLatestDocument = Boolean(
    latestVerification?.document_url &&
      (userBlocking ||
        recordBlocking ||
        verificationStatus === "rejected" ||
        (verificationStatus === "none" && latestVerification?.status === "rejected")),
  );

  return {
    identity_verified: identityVerified,
    identity_verification_status: verificationStatus,
    can_submit_verification,
    identity_verification_submitted_at: latestVerification?.submitted_at ?? null,
    identity_verification_rejection_reason:
      verificationStatus === "rejected"
        ? latestVerification?.rejection_reason ?? null
        : null,
    identity_verification_document_url: showLatestDocument
      ? latestVerification?.document_url ?? null
      : null,
    identity_verification_document_type: showLatestDocument
      ? latestVerification?.document_type ?? null
      : null,
    identity_verification_id: showLatestDocument ? latestVerification?.id ?? null : null,
  };
}
