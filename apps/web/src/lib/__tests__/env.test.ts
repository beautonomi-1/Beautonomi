import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateServerEnv } from "../env";

describe("validateServerEnv", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("is a no-op outside production", () => {
    process.env.NODE_ENV = "development";
    expect(validateServerEnv().ok).toBe(true);
  });

  it("reports missing required production secrets by name", () => {
    const prev = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
      PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
      PAYSTACK_WEBHOOK_SECRET: process.env.PAYSTACK_WEBHOOK_SECRET,
      CRON_SECRET: process.env.CRON_SECRET,
      CSRF_SECRET: process.env.CSRF_SECRET,
    };

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_WEBHOOK_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.CSRF_SECRET;

    const result = validateServerEnv();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("NEXT_PUBLIC_SUPABASE_URL"))).toBe(true);
    expect(result.errors.some((e) => e.includes("PAYSTACK_SECRET_KEY"))).toBe(true);
    expect(result.errors.some((e) => e.includes("CRON_SECRET"))).toBe(true);

    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("failFast throws with env key names", () => {
    delete process.env.CRON_SECRET;
    delete process.env.CSRF_SECRET;
    expect(() => validateServerEnv({ failFast: true })).toThrow(/CRON_SECRET|CSRF_SECRET/);
  });
});
