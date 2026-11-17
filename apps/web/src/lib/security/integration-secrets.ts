/**
 * F3-24: provider Twilio / email integration secrets at rest.
 * Ciphertext is prefixed so legacy plaintext rows still decrypt as-is.
 * Uses `encryptSensitiveField` (PAYROLL_FIELD_ENCRYPTION_KEY / INTERNAL_API_SECRET).
 */
import { decryptSensitiveField, encryptSensitiveField } from "./field-encryption";

export const INTEGRATION_SECRET_PREFIX = "enc.v1.";

export function encryptIntegrationSecret(plaintext: string): string {
  return INTEGRATION_SECRET_PREFIX + encryptSensitiveField(plaintext);
}

export function revealIntegrationSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (stored.startsWith(INTEGRATION_SECRET_PREFIX)) {
    return decryptSensitiveField(stored.slice(INTEGRATION_SECRET_PREFIX.length)) ?? "";
  }
  return stored;
}

export function isEncryptedIntegrationSecret(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(INTEGRATION_SECRET_PREFIX);
}
