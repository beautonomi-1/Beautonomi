/** Framework-agnostic client calls for MFA / device verification / step-up (web + Expo). */

export type SecurityApiError = { message: string; code?: string; details?: unknown };
export type SecurityApiResult<T> = { data: T | null; error: SecurityApiError | null };

export type SecurityApi = {
  get: <T>(path: string) => Promise<SecurityApiResult<T>>;
  post: <T>(path: string, body?: Record<string, unknown>) => Promise<SecurityApiResult<T>>;
  delete?: <T>(path: string) => Promise<SecurityApiResult<T>>;
};

export type SessionSecurityStatus = {
  status: "ok" | "mfa_required" | "device_required";
  applies: boolean;
  mfa: { enrolled: boolean; satisfied: boolean };
  device: { verified: boolean; limited_until: string | null; methods: string[] };
  step_up_methods: string[];
  masked_email: string | null;
  has_phone: boolean;
  policy: { step_up: string; device_verification: string };
};

export type CodeChallenge = { challenge_id: string; expires_at: string; sent_to: string };

export type TrustedDevice = {
  id: string;
  label: string | null;
  platform: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  trusted_until: string | null;
  is_current: boolean;
};

const ERROR_COPY: Record<string, string> = {
  INVALID_CODE: "That code isn't right. Check it and try again.",
  CODE_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many incorrect attempts. Send a new code.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  INVALID_PASSWORD: "That password isn't right.",
  NO_EMAIL_ON_FILE: "There's no email address on this account.",
  STEP_UP_FAILED: "We couldn't confirm it's you. Try again.",
  INVALID_RECOVERY_CODE: "That recovery code isn't valid or was already used.",
  NETWORK_ERROR: "You're offline or the connection dropped. Try again.",
  TIMEOUT: "That took too long. Try again.",
};

export function securityErrorMessage(error: SecurityApiError | null | undefined, fallback = "Something went wrong. Try again."): string {
  if (!error) return fallback;
  if (error.code && ERROR_COPY[error.code]) {
    const remaining = (error.details as { attempts_remaining?: number } | undefined)?.attempts_remaining;
    if (error.code === "INVALID_CODE" && typeof remaining === "number") {
      return `${ERROR_COPY.INVALID_CODE} ${remaining} ${remaining === 1 ? "attempt" : "attempts"} left.`;
    }
    return ERROR_COPY[error.code];
  }
  return error.message || fallback;
}

export function getSessionSecurityStatus(api: SecurityApi, options?: { sync?: boolean }) {
  return api.get<SessionSecurityStatus>(
    `/api/auth/security/session-status${options?.sync ? "?sync=1" : ""}`,
  );
}

export function registerDeviceKey(api: SecurityApi) {
  return api.post<{ device_key: string }>("/api/auth/device/register", {});
}

export function autoVerifyDevice(api: SecurityApi) {
  return api.post<{ status: "trusted" | "verification_required"; methods?: string[] }>(
    "/api/auth/device/verify",
    {},
  );
}

export function startDeviceCode(api: SecurityApi) {
  return api.post<CodeChallenge>("/api/auth/device/challenge/start", {});
}

export function verifyDeviceCode(api: SecurityApi, challengeId: string, code: string) {
  return api.post<{ status: "trusted" }>("/api/auth/device/challenge/verify", {
    challenge_id: challengeId,
    code: code.replace(/\D/g, ""),
  });
}

export function startStepUpCode(api: SecurityApi, action?: string) {
  return api.post<CodeChallenge>("/api/auth/step-up/code", action ? { action } : {});
}

export type StepUpInput =
  | { method: "totp" }
  | { method: "sms_signin" }
  | { method: "password"; password: string }
  | { method: "code"; challenge_id: string; code: string };

export function verifyStepUp(api: SecurityApi, input: StepUpInput) {
  return api.post<{ ok: true; expires_at: string }>("/api/auth/step-up/verify", input as Record<string, unknown>);
}

export function notifyMfaChanged(api: SecurityApi, event: "enrolled" | "unenrolled") {
  return api.post<{ enrolled: boolean }>("/api/auth/mfa/changed", { event });
}

export function generateRecoveryCodes(api: SecurityApi) {
  return api.post<{ codes: string[] }>("/api/auth/mfa/recovery-codes", {});
}

export function getRecoveryCodeCount(api: SecurityApi) {
  return api.get<{ remaining: number }>("/api/auth/mfa/recovery-codes");
}

export function redeemRecoveryCode(api: SecurityApi, code: string) {
  return api.post<{ ok: true; mfa_removed: boolean }>("/api/auth/mfa/recover", { code });
}

export function listTrustedDevices(api: SecurityApi) {
  return api.get<{ devices: TrustedDevice[] }>("/api/auth/devices");
}

export function revokeTrustedDevice(api: SecurityApi, id: string) {
  if (!api.delete) return Promise.resolve({ data: null, error: { message: "Not supported" } });
  return api.delete<{ ok: true }>(`/api/auth/devices/${encodeURIComponent(id)}`);
}

/** "in 3 hours" style hint for the device-too-new hold. */
export function formatAvailableAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.ceil(ms / 3_600_000);
  if (hours <= 1) return "within the hour";
  if (hours < 48) return `in about ${hours} hours`;
  return `in about ${Math.ceil(hours / 24)} days`;
}
