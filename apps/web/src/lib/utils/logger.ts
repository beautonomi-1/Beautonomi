/**
 * Structured logging utility (Wave 5.1 hardened).
 *
 * Every API route should use `logger.info / warn / error` instead of raw
 * `console.*`. The logger does three things the raw console can't:
 *
 *  1. Emits a single JSON line per event with a stable schema (timestamp,
 *     level, message, plus structured context). Makes Vercel / Datadog /
 *     CloudWatch filtering and alerting practical.
 *  2. Redacts PII by default. Any key in `PII_KEYS` in the context object
 *     (or any nested object) gets replaced with `[REDACTED]` before it
 *     leaves the process. This protects us from leaking emails, phone
 *     numbers, tokens, card tails and idempotency keys through log
 *     aggregators. When a caller genuinely needs a full value for
 *     debugging they can still pass it through `context.debug` — which
 *     will be stripped in production.
 *  3. Mirrors warnings and errors into Sentry as breadcrumbs (and for
 *     `error` level, as `captureException` / `captureMessage`) so the
 *     same event is queryable in both log and error-reporting pipelines
 *     without asking each route to remember to do both.
 *
 * A `no-console` lint rule (see `apps/web/eslint.config.mjs`) enforces
 * that API routes go through this module.
 */

import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  userId?: string;
  role?: string;
  requestId?: string;
  path?: string;
  method?: string;
  [key: string]: unknown;
}

/**
 * Keys that must NEVER leave the process in clear. Extend conservatively.
 * Names are matched case-insensitively and anywhere in the key (so both
 * `email` and `customer_email` redact).
 */
const PII_KEYS = [
  "email",
  "phone",
  "msisdn",
  "otp",
  "password",
  "secret",
  "token",
  "authorization",
  "auth",
  "cookie",
  "bearer",
  "card",
  "pan",
  "cvv",
  "ssn",
  "idnumber",
  "id_number",
  "idempotencykey",
  "idempotency_key",
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 4;

function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PII_KEYS.some((p) => lower.includes(p));
}

function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiKey(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function safeContext(context?: LogContext): Record<string, unknown> | undefined {
  if (!context) return undefined;
  // In production, drop `debug` field entirely — it's meant to be an
  // escape hatch for local reasoning, not a prod log field.
  const { debug: _debug, ...rest } = context;
  if (process.env.NODE_ENV === "production") {
    return redact(rest) as Record<string, unknown>;
  }
  return redact(rest) as Record<string, unknown>;
}

class Logger {
  private format(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      ...(safeContext(context) ?? {}),
    });
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug(this.format("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.log(this.format("info", message, context));
    try {
      Sentry.addBreadcrumb({
        category: "log",
        level: "info",
        message,
        data: safeContext(context),
      });
    } catch {
      // never fail on breadcrumb
    }
  }

  warn(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.warn(this.format("warn", message, context));
    try {
      Sentry.addBreadcrumb({
        category: "log",
        level: "warning",
        message,
        data: safeContext(context),
      });
    } catch {
      // noop
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errInfo =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error !== undefined
          ? { value: String(error) }
          : undefined;
    const combined: LogContext = errInfo
      ? { ...(context ?? {}), error: errInfo }
      : (context ?? {});
    // eslint-disable-next-line no-console
    console.error(this.format("error", message, combined));
    try {
      const safe = safeContext(combined);
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: safe, tags: { source: "logger" } });
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          extra: safe,
          tags: { source: "logger" },
        });
      }
    } catch {
      // never fail on sentry capture
    }
  }

  logRequest(method: string, path: string, userId?: string, role?: string): void {
    this.info(`${method} ${path}`, {
      method,
      path,
      userId,
      role,
      type: "api_request",
    });
  }

  logResponse(
    method: string,
    path: string,
    statusCode: number,
    duration?: number,
  ): void {
    this.info(`${method} ${path} - ${statusCode}`, {
      method,
      path,
      statusCode,
      duration,
      type: "api_response",
    });
  }

  logDatabase(operation: string, table: string, context?: LogContext): void {
    this.debug(`DB ${operation} on ${table}`, {
      ...context,
      operation,
      table,
      type: "database",
    });
  }

  logPayment(
    transactionId: string,
    status: string,
    amount?: number,
    context?: LogContext,
  ): void {
    this.info(`Payment ${status}`, {
      ...context,
      transactionId,
      status,
      amount,
      type: "payment",
    });
  }

  logNotification(
    eventType: string,
    recipients: string,
    status: string,
    context?: LogContext,
  ): void {
    this.info(`Notification ${status}`, {
      ...context,
      eventType,
      recipients,
      status,
      type: "notification",
    });
  }

  logAdminAction(
    action: string,
    resource: string,
    resourceId: string,
    userId: string,
    context?: LogContext,
  ): void {
    this.info(`Admin ${action}`, {
      ...context,
      action,
      resource,
      resourceId,
      userId,
      type: "admin_action",
    });
  }
}

export const logger = new Logger();

/**
 * Exposed so unit tests (and the reconciliation drift suite) can assert
 * the redactor keeps up with schema drift.
 */
export function __redactForTests(value: unknown): unknown {
  return redact(value);
}
