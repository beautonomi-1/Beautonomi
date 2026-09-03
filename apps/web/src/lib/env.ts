import { z } from "zod";

const PLACEHOLDER_MARKERS = [
  "placeholder",
  "your_secret_here",
  "changeme",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIi",
] as const;

const paystackSecretKey = z
  .string()
  .min(1, "PAYSTACK_SECRET_KEY is required")
  .regex(/^sk_(live|test)_[a-zA-Z0-9]+$/, "PAYSTACK_SECRET_KEY must match sk_live_* or sk_test_*");

const paystackWebhookSecret = z
  .string()
  .min(8, "PAYSTACK_WEBHOOK_SECRET must be at least 8 characters");

const cronOrCsrfSecret = z
  .string()
  .min(32, "Secret must be at least 32 characters");

const productionServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  PAYSTACK_SECRET_KEY: paystackSecretKey,
  PAYSTACK_WEBHOOK_SECRET: paystackWebhookSecret,
  CRON_SECRET: cronOrCsrfSecret,
  CSRF_SECRET: cronOrCsrfSecret.optional(),
});

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some(
    (marker) => normalized.includes(marker) || normalized === marker,
  );
}

export type ServerEnvValidation = {
  ok: boolean;
  errors: string[];
};

/**
 * Optional rollout flag (not validated here): WORKFLOWS_ENABLED — comma-separated workflow
 * families (`agent`, `settlement`, …) or `all` / `*`. Unset keeps legacy inline/cron paths.
 *
 * Optional ops alerting (not validated here): OPS_ALERT_EMAIL — comma-separated ops
 * mailbox(es). When a Slack alert fails to deliver twice in a row for the same dedupe key,
 * `lib/integrations/slack/dispatch.ts` emails the alert here via Resend. Unset = Slack only.
 */

/**
 * Validates critical server env vars in production. No-op in dev/test.
 * Call from instrumentation.ts so misconfiguration fails at boot.
 */
export function validateServerEnv(options?: { failFast?: boolean }): ServerEnvValidation {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true, errors: [] };
  }

  const errors: string[] = [];
  const parsed = productionServerEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      errors.push(`${path}: ${issue.message}`);
    }
  }

  for (const key of productionServerEnvSchema.keyof().options) {
    const value = process.env[key];
    if (value && isPlaceholderValue(value)) {
      errors.push(`${key}: placeholder or demo value detected`);
    }
  }

  const result = { ok: errors.length === 0, errors };

  if (options?.failFast && !result.ok) {
    throw new Error(
      `[STARTUP] FATAL: Invalid server environment:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  if (!result.ok) {
    console.error(
      `[STARTUP] FATAL: Invalid server environment:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return result;
}
