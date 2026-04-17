import * as Sentry from "@sentry/nextjs";

// ─── Required server-side environment variable check ─────────────────────────
// These are critical for the application to function. Missing vars in production
// will cause silent failures (DB auth errors, payment gateway rejections, etc.).
// Fail fast at startup rather than at runtime in the middle of a user session.
const REQUIRED_SERVER_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "CRON_SECRET",
] as const;

function checkEnvVars() {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  const placeholder: string[] = [];

  for (const key of REQUIRED_SERVER_ENV_VARS) {
    const val = process.env[key];
    if (!val) {
      missing.push(key);
    } else if (
      val.includes("placeholder") ||
      val === "your_secret_here" ||
      val === "changeme" ||
      val.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIi") // demo JWT
    ) {
      placeholder.push(key);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[STARTUP] FATAL: Missing required environment variables: ${missing.join(", ")}. ` +
      "The application will not function correctly. Set these in your Vercel project settings."
    );
  }
  if (placeholder.length > 0) {
    console.error(
      `[STARTUP] FATAL: Placeholder/demo values detected for: ${placeholder.join(", ")}. ` +
      "Replace these with real production values before going live."
    );
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    checkEnvVars();
    await import("./sentry.server.config");
    // F26 — start OTel only when enabled via env.
    if (process.env.OTEL_ENABLED === "1") {
      try {
        const { registerOtel } = await import("./src/lib/otel/register");
        await registerOtel();
      } catch (err) {
        console.warn("[otel] failed to import registration module", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
