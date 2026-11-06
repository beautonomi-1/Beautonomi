export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED";
export const PROVIDER_MFA_REQUIRED = "PROVIDER_MFA_REQUIRED";
export const DEVICE_VERIFICATION_REQUIRED = "DEVICE_VERIFICATION_REQUIRED";
export const IMPERSONATION_RESTRICTED = "IMPERSONATION_RESTRICTED";
export const PAYOUT_ACCOUNT_COOLING_OFF = "PAYOUT_ACCOUNT_COOLING_OFF";

export const SECURITY_CHALLENGE_CODES = [
  STEP_UP_REQUIRED,
  PROVIDER_MFA_REQUIRED,
  DEVICE_VERIFICATION_REQUIRED,
  IMPERSONATION_RESTRICTED,
] as const;

export type SecurityChallengeCode = (typeof SECURITY_CHALLENGE_CODES)[number];

export type SecurityChallengeDetails = {
  methods?: string[];
  action?: string;
  masked_email?: string | null;
  reason?: string;
  available_at?: string;
  request_id?: string;
};

export class SecurityChallengeError extends Error {
  readonly status = 403;
  readonly code: SecurityChallengeCode | typeof IMPERSONATION_RESTRICTED;
  readonly details?: SecurityChallengeDetails;

  constructor(
    message: string,
    code: SecurityChallengeCode | typeof IMPERSONATION_RESTRICTED,
    details?: SecurityChallengeDetails,
  ) {
    super(message);
    this.name = "SecurityChallengeError";
    this.code = code;
    this.details = details;
    Object.assign(this, { status: 403, code, details });
  }
}

/** Structural check (survives duplicated bundles / serialization, unlike `instanceof`). */
export function isSecurityChallengeError(err: unknown): err is SecurityChallengeError {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; code?: unknown };
  return e.status === 403 && isSecurityChallengeCode(e.code);
}

export function isSecurityChallengeCode(code: unknown): code is SecurityChallengeCode {
  return typeof code === "string" && (SECURITY_CHALLENGE_CODES as readonly string[]).includes(code);
}
