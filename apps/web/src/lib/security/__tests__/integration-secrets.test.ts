import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encryptIntegrationSecret,
  INTEGRATION_SECRET_PREFIX,
  isEncryptedIntegrationSecret,
  revealIntegrationSecret,
} from "../integration-secrets";

describe("integration secrets (F3-24)", () => {
  const prevPayroll = process.env.PAYROLL_FIELD_ENCRYPTION_KEY;
  const prevInternal = process.env.INTERNAL_API_SECRET;
  const prevCron = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.PAYROLL_FIELD_ENCRYPTION_KEY = "test-field-encryption-material";
    delete process.env.INTERNAL_API_SECRET;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (prevPayroll === undefined) delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY;
    else process.env.PAYROLL_FIELD_ENCRYPTION_KEY = prevPayroll;
    if (prevInternal === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = prevInternal;
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
  });

  it("round-trips a dummy token and does not store plaintext", () => {
    const dummy = "dummy-twilio-token";
    const stored = encryptIntegrationSecret(dummy);
    expect(stored.startsWith(INTEGRATION_SECRET_PREFIX)).toBe(true);
    expect(stored.includes(dummy)).toBe(false);
    expect(revealIntegrationSecret(stored)).toBe(dummy);
    expect(isEncryptedIntegrationSecret(stored)).toBe(true);
  });

  it("reads legacy plaintext rows without a prefix", () => {
    expect(revealIntegrationSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
    expect(isEncryptedIntegrationSecret("legacy-plaintext-token")).toBe(false);
  });

  it("returns empty string for missing values", () => {
    expect(revealIntegrationSecret(null)).toBe("");
    expect(revealIntegrationSecret(undefined)).toBe("");
  });
});
