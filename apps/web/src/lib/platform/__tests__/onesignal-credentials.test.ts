import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("resolveOneSignalCredentials env precedence", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ONESIGNAL_APP_ID;
    delete process.env.ONESIGNAL_REST_API_KEY;
    delete process.env.ONESIGNAL_APP_ID_CUSTOMER;
    delete process.env.ONESIGNAL_APP_ID_PROVIDER;
    delete process.env.ONESIGNAL_REST_API_KEY_CUSTOMER;
    delete process.env.ONESIGNAL_REST_API_KEY_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("prefers per-app env vars over database", async () => {
    process.env.ONESIGNAL_APP_ID_CUSTOMER = "env-customer-app";
    process.env.ONESIGNAL_REST_API_KEY_CUSTOMER = "env-customer-key";

    const { resolveOneSignalCredentials } = await import("@/lib/platform/secrets");
    const customer = await resolveOneSignalCredentials("customer");
    expect(customer.appId).toBe("env-customer-app");
    expect(customer.restKey).toBe("env-customer-key");
  });

  it("uses provider env vars for provider appType", async () => {
    process.env.ONESIGNAL_APP_ID_PROVIDER = "env-provider-app";
    process.env.ONESIGNAL_REST_API_KEY_PROVIDER = "env-provider-key";

    const { resolveOneSignalCredentials } = await import("@/lib/platform/secrets");
    const provider = await resolveOneSignalCredentials("provider");
    expect(provider.appId).toBe("env-provider-app");
    expect(provider.restKey).toBe("env-provider-key");
  });
});
