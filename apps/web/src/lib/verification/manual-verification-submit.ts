/**
 * Server-side guards and error mapping for manual identity document uploads.
 */

export const MANUAL_VERIFICATION_BLOCKING_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "under_review",
] as const;

export type ManualVerificationBlockingStatus =
  (typeof MANUAL_VERIFICATION_BLOCKING_STATUSES)[number];

const BLOCKING_SET = new Set<string>(MANUAL_VERIFICATION_BLOCKING_STATUSES);

export type ManualVerificationRecord = {
  status: string;
  document_type?: string;
};

export type CanSubmitManualVerificationInput = {
  identityVerified: boolean;
  userStatus: string;
  verificationRecords: ManualVerificationRecord[];
};

export type ManualVerificationSubmitBlock = { reason: string; status: 409 };

/**
 * Returns why a new manual verification upload is blocked, or null when the
 * user may submit. Rejected and reset states allow resubmission; in-flight
 * reviews block.
 */
export function getManualVerificationSubmitBlock(
  input: CanSubmitManualVerificationInput,
): ManualVerificationSubmitBlock | null {
  if (input.identityVerified) {
    return {
      status: 409,
      reason: "Your identity is already verified.",
    };
  }

  const userStatus = input.userStatus ?? "none";
  const records = input.verificationRecords ?? [];

  const userBlocking = records.length > 0 && BLOCKING_SET.has(userStatus);
  const recordBlocking = records.some((record) => BLOCKING_SET.has(record.status));

  if (userBlocking || recordBlocking) {
    return {
      status: 409,
      reason: "You already have an identity verification submission under review.",
    };
  }

  return null;
}

export function isUniqueVerificationConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  if (code === "23505") return true;
  const msg = typeof rec.message === "string" ? rec.message.toLowerCase() : "";
  return msg.includes("duplicate key") || msg.includes("unique constraint");
}

export function mapVerificationUploadError(
  error: unknown,
): { status: number; message: string } | null {
  if (isUniqueVerificationConflict(error)) {
    return {
      status: 409,
      message:
        "You already have a submission of this document type under review. Please wait for the current review to complete.",
    };
  }
  return null;
}

export function buildManualVerificationUpsertRow(input: {
  userId: string;
  documentType: string;
  country: string;
  documentUrl: string;
  tenantId: string | null;
  submittedAt?: string;
}) {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  return {
    user_id: input.userId,
    document_type: input.documentType,
    country: input.country,
    document_url: input.documentUrl,
    status: "pending" as const,
    rejection_reason: null,
    reviewed_at: null,
    reviewed_by: null,
    submitted_at: submittedAt,
    tenant_id: input.tenantId,
  };
}
